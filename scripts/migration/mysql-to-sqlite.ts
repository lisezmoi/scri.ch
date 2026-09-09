import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import sharp from "sharp";
import { decodeShortId } from "../../src/id";
import { DrawingDatabase, type DrawingRecord } from "../../src/server/database";
import { type DrawingSettings, MAX_DIMENSION, MAX_PIXELS } from "../../src/settings";
import { type LegacyDrawingRow, parseScrichDump } from "./mysql-dump";
import { parseLegacySettings } from "./php-serialize";

export interface MigrationOptions {
  source: string;
  database?: "scrich";
  mediaDir: string;
  outputDir: string;
  rejectedDir: string;
}

interface RejectedEntry {
  shortId: string;
  legacyRowIds: number[];
  reason: string;
  bytes?: number;
  sha256?: string;
  copiedPaths?: string[];
  files?: { name: string; bytes: number; sha256: string; copiedPath: string; }[];
}

export interface MigrationReport {
  sourceRows: number;
  distinctIds: number;
  imported: number;
  duplicateGroupsCollapsed: number;
  duplicateRowsCollapsed: number;
  invalidMedia: number;
  missingMedia: number;
  orphanMedia: number;
  reserved: number;
  rejectedManifest: string;
  nextDrawingValue: number;
}

function argumentsFrom(argv: string[]): MigrationOptions {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || !value) {
      throw new Error("Migration arguments must be --name value pairs");
    }
    values.set(key, value);
  }
  const required = (key: string): string => {
    const value = values.get(key);
    if (!value) throw new Error(`Missing ${key}`);
    return resolve(value);
  };
  const database = values.get("--database");
  if (database !== undefined && database !== "scrich") {
    throw new Error("--database must be scrich (for a single-database dump without USE)");
  }
  return {
    ...(database === "scrich" ? { database } as const : {}),
    source: required("--source"),
    mediaDir: required("--media-dir"),
    outputDir: required("--output-dir"),
    rejectedDir: required("--rejected-dir"),
  };
}

function groupRows(rows: LegacyDrawingRow[]): Map<string, LegacyDrawingRow[]> {
  const groups = new Map<string, LegacyDrawingRow[]>();
  for (const row of rows) {
    const group = groups.get(row.shortId) ?? [];
    group.push(row);
    groups.set(row.shortId, group);
  }
  return groups;
}

function relatedMedia(mediaNames: string[]): Map<string, string[]> {
  const related = new Map<string, string[]>();
  for (const name of mediaNames) {
    const match = /^([0-9a-z]+)-(?:raw|crop|cropped|[0-9]+x)\.png$/.exec(name);
    if (!match) continue;
    const entries = related.get(match[1]!) ?? [];
    entries.push(name);
    related.set(match[1]!, entries);
  }
  return related;
}

async function validateExistingPng(path: string): Promise<string | null> {
  try {
    const image = sharp(path, { failOn: "error", limitInputPixels: MAX_PIXELS });
    const metadata = await image.metadata();
    if (metadata.format !== "png") return "not_png";
    if (!metadata.width || !metadata.height) return "missing_dimensions";
    if (
      metadata.width > MAX_DIMENSION || metadata.height > MAX_DIMENSION
      || metadata.width * metadata.height > MAX_PIXELS
    ) return "dimensions_exceed_limit";
    // Force a complete output pipeline: stats() can lose decoder errors under concurrency.
    await image.png().toBuffer();
    return null;
  } catch {
    return "invalid_png";
  }
}

function isoDate(mysqlDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(mysqlDate)) {
    throw new Error(`Invalid legacy date: ${mysqlDate}`);
  }
  return `${mysqlDate.replace(" ", "T")}Z`;
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export async function migrate(options: MigrationOptions): Promise<MigrationReport> {
  sharp.cache(false);
  for (
    const [label, path] of [
      ["output", options.outputDir],
      ["rejected", options.rejectedDir],
    ] as const
  ) {
    if (existsSync(path)) throw new Error(`${label} directory already exists: ${path}`);
  }
  if (!existsSync(options.source)) throw new Error(`SQL source does not exist: ${options.source}`);
  if (!statSync(options.mediaDir).isDirectory()) {
    throw new Error(`Media directory does not exist: ${options.mediaDir}`);
  }

  const rows = parseScrichDump(readFileSync(options.source, "utf8"), options.database === "scrich");
  const groups = groupRows(rows);
  const canonicalIds = new Map<number, number>();
  for (const group of groups.values()) {
    const id = group.reduce((minimum, row) => Math.min(minimum, row.id), Infinity);
    for (const row of group) canonicalIds.set(row.id, id);
  }
  const mediaNames = readdirSync(options.mediaDir);
  const rawIds = new Set(
    mediaNames.flatMap((name) => /^([0-9a-z]+)\.png$/.exec(name)?.[1] ?? []),
  );
  const related = relatedMedia(mediaNames);
  // Reserve every historical URL, including records/media excluded from the import.
  let maximumValue = 0;
  for (const shortId of new Set([...groups.keys(), ...rawIds, ...related.keys()])) {
    maximumValue = Math.max(maximumValue, decodeShortId(shortId));
  }
  const nextDrawingValue = maximumValue + 1;
  if (!Number.isSafeInteger(nextDrawingValue)) {
    throw new Error("Historical drawing IDs exhaust the allocator");
  }
  const orphanIds = [...new Set([...rawIds, ...related.keys()])].filter((id) => !groups.has(id));
  const accepted: Omit<DrawingRecord, "visibility">[] = [];
  const rejected: RejectedEntry[] = [];
  let duplicateGroupsCollapsed = 0;
  let duplicateRowsCollapsed = 0;
  let invalidMedia = 0;
  let missingMedia = 0;
  let reserved = 0;

  const entries = [...groups.entries()];
  let cursor = 0;
  let processed = 0;
  const workers = Array.from({ length: Math.min(16, entries.length) }, async () => {
    for (;;) {
      const entry = entries[cursor++];
      if (!entry) return;
      const [shortId, group] = entry;
      processed++;
      if (processed % 1_000 === 0 || processed === entries.length) {
        console.log(`Processing ${processed}/${entries.length} drawing IDs`);
      }
      if (shortId === "404") {
        reserved++;
        rejected.push({ shortId, legacyRowIds: group.map((row) => row.id), reason: "reserved_id" });
        continue;
      }
      decodeShortId(shortId);
      const original = join(options.mediaDir, `${shortId}.png`);
      if (!existsSync(original)) {
        missingMedia++;
        rejected.push({ shortId, legacyRowIds: group.map((row) => row.id), reason: "missing_png" });
        continue;
      }
      const invalidReason = await validateExistingPng(original);
      if (invalidReason) {
        invalidMedia++;
        rejected.push({
          shortId,
          legacyRowIds: group.map((row) => row.id),
          reason: invalidReason,
          bytes: statSync(original).size,
          sha256: sha256(original),
        });
        continue;
      }

      const normalized = group.map((row) => parseLegacySettings(row.serializedSettings));
      const canonical = new Set(normalized.map((settings) => JSON.stringify(settings)));
      if (canonical.size !== 1) {
        throw new Error(`Valid duplicate ${shortId} has conflicting settings; resolve it manually`);
      }
      const parents = new Set(group.map((row) => {
        if (row.parent === null) return null;
        const parent = canonicalIds.get(row.parent);
        if (parent === undefined) throw new Error(`Drawing ${shortId} has a missing parent`);
        return parent;
      }));
      if (parents.size !== 1) {
        throw new Error(`Valid duplicate ${shortId} has conflicting parents; resolve it manually`);
      }
      const first = group.reduce((oldest, row) => row.id < oldest.id ? row : oldest);
      accepted.push({
        id: first.id,
        parent: [...parents][0]!,
        shortId,
        settings: normalized[0] as DrawingSettings,
        createdAt: isoDate(first.createdAt),
      });
      if (group.length > 1) {
        duplicateGroupsCollapsed++;
        duplicateRowsCollapsed += group.length - 1;
      }
    }
  });
  await Promise.all(workers);
  const acceptedIds = new Set(accepted.map((row) => row.id));
  for (const drawing of accepted) {
    if (drawing.parent !== null && !acceptedIds.has(drawing.parent)) {
      throw new Error(`Drawing ${drawing.shortId} has a parent whose media was rejected`);
    }
  }

  for (const shortId of orphanIds) {
    rejected.push({ shortId, legacyRowIds: [], reason: "orphan_media" });
  }
  mkdirSync(options.rejectedDir, { recursive: true, mode: 0o700 });
  mkdirSync(join(options.rejectedDir, "orphan"));
  mkdirSync(join(options.rejectedDir, "reserved"));
  mkdirSync(join(options.outputDir, "drawings"), { recursive: true });
  mkdirSync(join(options.outputDir, "cache", "v3"), { recursive: true });
  mkdirSync(join(options.outputDir, "tmp"), { recursive: true });
  mkdirSync(join(options.rejectedDir, "invalid-png"), { recursive: true, mode: 0o700 });
  mkdirSync(join(options.rejectedDir, "related"), { recursive: true });

  accepted.sort((left, right) => left.id - right.id);
  const database = new DrawingDatabase(join(options.outputDir, "scrich.sqlite"));
  try {
    database.raw.transaction(() => {
      for (const drawing of accepted) database.insertImported(drawing);
      database.seedAllocator(nextDrawingValue);
    }).immediate();
  } finally {
    database.close();
  }
  for (const drawing of accepted) {
    copyFileSync(
      join(options.mediaDir, `${drawing.shortId}.png`),
      join(options.outputDir, "drawings", `${drawing.shortId}.png`),
    );
  }

  for (const entry of rejected) {
    const copiedPaths: string[] = [];
    entry.files = [];
    const archive = (name: string, directory: string) => {
      const source = join(options.mediaDir, name);
      const destination = join(options.rejectedDir, directory, name);
      copyFileSync(source, destination);
      copiedPaths.push(destination);
      entry.files!.push({
        name,
        bytes: statSync(source).size,
        sha256: sha256(source),
        copiedPath: destination,
      });
    };
    const originalName = `${entry.shortId}.png`;
    if (existsSync(join(options.mediaDir, originalName))) {
      archive(
        originalName,
        entry.reason === "orphan_media"
          ? "orphan"
          : entry.reason === "reserved_id"
          ? "reserved"
          : "invalid-png",
      );
    }
    for (const name of related.get(entry.shortId) ?? []) archive(name, "related");
    if (copiedPaths.length) entry.copiedPaths = copiedPaths;
  }

  const manifestPath = join(options.rejectedDir, "manifest.jsonl");
  writeFileSync(manifestPath, rejected.map((entry) => JSON.stringify(entry)).join("\n") + "\n");
  const report: MigrationReport = {
    sourceRows: rows.length,
    distinctIds: groups.size,
    imported: accepted.length,
    duplicateGroupsCollapsed,
    duplicateRowsCollapsed,
    invalidMedia,
    missingMedia,
    orphanMedia: orphanIds.length,
    reserved,
    rejectedManifest: manifestPath,
    nextDrawingValue,
  };
  writeFileSync(join(options.rejectedDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (import.meta.main) {
  try {
    const options = argumentsFrom(process.argv.slice(2));
    const report = await migrate(options);
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
