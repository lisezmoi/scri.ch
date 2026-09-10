import { Database } from "bun:sqlite";
import { decodeShortId, encodeShortId, RESERVED_IDS } from "../id";
import type { DrawingSettings } from "../settings";

export type DrawingVisibility = "visible" | "hidden";

export interface DrawingRecord {
  // Dimensions of the normal .png export (including cropping/padding), not the raw canvas.
  cropWidth: number | null;
  cropHeight: number | null;
  parent: number | null;
  visibility: DrawingVisibility;
  id: number;
  shortId: string;
  settings: DrawingSettings;
  createdAt: string;
}

interface DrawingRow {
  crop_width: number | null;
  crop_height: number | null;
  parent: number | null;
  visibility: DrawingVisibility;
  id: number;
  short_id: string;
  settings_json: string;
  created_at: string;
}

export const DATABASE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS drawings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    short_id TEXT NOT NULL UNIQUE,
    parent INTEGER REFERENCES drawings(id) DEFERRABLE INITIALLY DEFERRED,
    crop_width INTEGER CHECK (crop_width IS NULL OR (typeof(crop_width) = 'integer' AND crop_width > 0)),
    crop_height INTEGER CHECK (crop_height IS NULL OR (typeof(crop_height) = 'integer' AND crop_height > 0)),
    settings_json TEXT NOT NULL CHECK (json_valid(settings_json)),
    created_at TEXT NOT NULL,
    visibility TEXT NOT NULL DEFAULT 'visible' CHECK (visibility IN ('visible', 'hidden'))
  );
  CREATE INDEX IF NOT EXISTS drawings_created_at_idx ON drawings (created_at, id);
  CREATE TABLE IF NOT EXISTS allocator (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    next_value INTEGER NOT NULL CHECK (next_value > 0)
  );
  INSERT OR IGNORE INTO allocator (singleton, next_value) VALUES (1, 1);
`;

function record(row: DrawingRow): DrawingRecord {
  return {
    cropWidth: row.crop_width,
    cropHeight: row.crop_height,
    parent: row.parent,
    visibility: row.visibility,
    id: row.id,
    shortId: row.short_id,
    settings: JSON.parse(row.settings_json) as DrawingSettings,
    createdAt: row.created_at,
  };
}

export class InvalidParentError extends Error {}

export class DrawingDatabase {
  readonly raw: Database;

  constructor(path: string, create = true) {
    this.raw = create
      ? new Database(path, { create: true })
      : new Database(path, { create: false, readwrite: true });
    this.raw.exec("PRAGMA journal_mode = WAL;");
    this.raw.exec("PRAGMA synchronous = NORMAL;");
    this.raw.exec("PRAGMA foreign_keys = ON;");
    this.raw.exec("PRAGMA busy_timeout = 5000;");
    this.raw.transaction(() => {
      this.raw.exec(DATABASE_SCHEMA);
      const columns = this.raw.query<{ name: string; }, []>("PRAGMA table_info(drawings)").all();
      for (const name of ["crop_width", "crop_height"]) {
        if (!columns.some((column) => column.name === name)) {
          this.raw.exec(
            `ALTER TABLE drawings ADD COLUMN ${name} INTEGER CHECK (${name} IS NULL OR (typeof(${name}) = 'integer' AND ${name} > 0))`,
          );
        }
      }
      if (!columns.some((column) => column.name === "visibility")) {
        this.raw.exec(
          "ALTER TABLE drawings ADD COLUMN visibility TEXT NOT NULL DEFAULT 'visible' CHECK (visibility IN ('visible', 'hidden'))",
        );
      }
      if (!columns.some((column) => column.name === "parent")) {
        this.raw.exec(
          "ALTER TABLE drawings ADD COLUMN parent INTEGER REFERENCES drawings(id) DEFERRABLE INITIALLY DEFERRED",
        );
      }
    }).immediate();
  }

  close(): void {
    this.raw.close();
  }

  find(shortId: string): DrawingRecord | null {
    const row = this.raw.query<DrawingRow, [string]>(
      "SELECT id, parent, short_id, settings_json, created_at, visibility, crop_width, crop_height FROM drawings WHERE short_id = ?",
    ).get(shortId);
    return row ? record(row) : null;
  }

  list(offset: number, limit: number): DrawingRecord[] {
    return this.raw.query<DrawingRow, [number, number]>(
      `SELECT id, parent, short_id, settings_json, created_at, visibility, crop_width, crop_height
       FROM drawings ORDER BY id DESC LIMIT ? OFFSET ?`,
    ).all(limit, offset).map(record);
  }

  missingCropDimensions(afterId: number, limit = 100): DrawingRecord[] {
    return this.raw.query<DrawingRow, [number, number]>(
      `SELECT id, parent, short_id, settings_json, created_at, visibility, crop_width, crop_height
       FROM drawings WHERE id > ? AND (crop_width IS NULL OR crop_height IS NULL)
       ORDER BY id LIMIT ?`,
    ).all(afterId, limit).map(record);
  }

  setCropDimensions(shortId: string, width: number, height: number): void {
    if (![width, height].every(value => Number.isSafeInteger(value) && value > 0)) {
      throw new Error("Image dimensions must be positive integers");
    }
    this.raw.query("UPDATE drawings SET crop_width = ?, crop_height = ? WHERE short_id = ?")
      .run(width, height, shortId);
  }

  count(): number {
    return this.raw.query<{ total: number; }, []>("SELECT COUNT(*) AS total FROM drawings").get()!
      .total;
  }

  insertImported(
    row: Omit<DrawingRecord, "visibility" | "parent" | "cropWidth" | "cropHeight"> & {
      parent?: number | null;
    },
  ): void {
    this.raw.query(
      `INSERT INTO drawings (id, short_id, settings_json, created_at, parent) VALUES (?, ?, ?, ?, ?)`,
    ).run(row.id, row.shortId, JSON.stringify(row.settings), row.createdAt, row.parent ?? null);
  }

  seedAllocator(nextValue: number): void {
    this.raw.query("UPDATE allocator SET next_value = ? WHERE singleton = 1").run(nextValue);
  }

  create(
    settings: DrawingSettings,
    createdAt: string,
    pathExists: (shortId: string) => boolean,
    beforeCommit: (shortId: string) => void,
    parentShortId: string | null = null,
  ): DrawingRecord {
    const transaction = this.raw.transaction(() => {
      const source = parentShortId === null ? null : this.find(parentShortId);
      if (parentShortId !== null && (!source || source.visibility !== "visible")) {
        throw new InvalidParentError("Invalid parent drawing");
      }
      const parent = source?.id ?? null;
      let nextValue = this.raw.query<{ next_value: number; }, []>(
        "SELECT next_value FROM allocator WHERE singleton = 1",
      ).get()!.next_value;
      let shortId = encodeShortId(nextValue);
      while (RESERVED_IDS.has(shortId) || this.find(shortId) || pathExists(shortId)) {
        shortId = encodeShortId(++nextValue);
      }
      this.raw.query("UPDATE allocator SET next_value = ? WHERE singleton = 1").run(nextValue + 1);
      const result = this.raw.query(
        "INSERT INTO drawings (short_id, settings_json, created_at, parent) VALUES (?, ?, ?, ?)",
      ).run(shortId, JSON.stringify(settings), createdAt, parent);
      beforeCommit(shortId);
      return {
        cropWidth: null,
        cropHeight: null,
        parent,
        id: Number(result.lastInsertRowid),
        shortId,
        settings,
        createdAt,
        visibility: "visible" as const,
      };
    });
    return transaction.immediate();
  }

  setVisibility(shortId: string, visibility: DrawingVisibility): DrawingRecord {
    return this.raw.transaction(() => {
      const drawing = this.find(shortId);
      if (!drawing) throw new Error(`Unknown drawing: ${shortId}`);
      this.raw.query("UPDATE drawings SET visibility = ? WHERE short_id = ?").run(
        visibility,
        shortId,
      );
      return { ...drawing, visibility };
    }).immediate();
  }

  delete(shortId: string): void {
    this.raw.query("DELETE FROM drawings WHERE short_id = ?").run(shortId);
  }

  nextValueFromExisting(): number {
    let maximum = 0;
    for (
      const { short_id } of this.raw.query<{ short_id: string; }, []>(
        "SELECT short_id FROM drawings",
      ).all()
    ) {
      maximum = Math.max(maximum, decodeShortId(short_id));
    }
    return maximum + 1;
  }
}
