import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { migrate } from "../../scripts/migration/mysql-to-sqlite";
import { DrawingDatabase } from "../../src/server/database";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

test("imports valid media, collapses equivalent duplicates, and copies rejected bytes", async () => {
  const root = mkdtempSync("/tmp/scrich-migration-test-");
  roots.push(root);
  const mediaDir = join(root, "legacy");
  const outputDir = join(root, "output");
  const rejectedDir = join(root, "rejected");
  mkdirSync(mediaDir);
  const png = await sharp({
    create: { width: 2, height: 2, channels: 4, background: "red" },
  }).png().toBuffer();
  writeFileSync(join(mediaDir, "1.png"), png);
  writeFileSync(join(mediaDir, "2.png"), "broken");
  const sql = `-- Current Database: \`scrich\`
USE \`scrich\`;
INSERT INTO \`drawings\` VALUES (1,'1',NULL,NULL,'2020-01-01 00:00:00'),(2,'1',NULL,'a:0:{}','2020-01-01 00:00:00'),(3,'2',NULL,NULL,'2020-01-02 00:00:00'),(4,'404',NULL,NULL,'2020-01-03 00:00:00');
-- Current Database: \`other\`
USE \`other\`;
`;
  const source = join(root, "dump.sql");
  writeFileSync(source, sql);

  const report = await migrate({ source, mediaDir, outputDir, rejectedDir });
  expect(report).toMatchObject({
    sourceRows: 4,
    distinctIds: 3,
    imported: 1,
    duplicateGroupsCollapsed: 1,
    duplicateRowsCollapsed: 1,
    invalidMedia: 1,
    reserved: 1,
  });
  expect(readFileSync(join(rejectedDir, "invalid-png", "2.png"), "utf8")).toBe("broken");
  expect(existsSync(join(rejectedDir, "manifest.jsonl"))).toBeTrue();
  const database = new DrawingDatabase(join(outputDir, "scrich.sqlite"), false);
  try {
    expect(database.count()).toBe(1);
    expect(database.find("1")?.settings).toEqual({});
  } finally {
    database.close();
  }
});

test("stops on a valid duplicate with conflicting settings", async () => {
  const root = mkdtempSync("/tmp/scrich-migration-conflict-test-");
  roots.push(root);
  const mediaDir = join(root, "legacy");
  mkdirSync(mediaDir);
  const png = await sharp({
    create: { width: 2, height: 2, channels: 4, background: "red" },
  }).png().toBuffer();
  writeFileSync(join(mediaDir, "1.png"), png);
  const source = join(root, "dump.sql");
  writeFileSync(
    source,
    `-- Current Database: \`scrich\`
USE \`scrich\`;
INSERT INTO \`drawings\` VALUES (1,'1',NULL,NULL,'2020-01-01 00:00:00'),(2,'1',NULL,'a:1:{s:10:"foreground";s:4:"#000";}','2020-01-01 00:00:01');
`,
  );

  await expect(migrate({
    source,
    mediaDir,
    outputDir: join(root, "output"),
    rejectedDir: join(root, "rejected"),
  })).rejects.toThrow("conflicting settings");
});

for (const mode of ["valid", "conflicting", "missing", "rejected"] as const) {
  test(`imports parent references: ${mode}`, async () => {
    const root = mkdtempSync("/tmp/scrich-parent-migration-");
    roots.push(root);
    const mediaDir = join(root, "legacy");
    mkdirSync(mediaDir);
    const png = await sharp({ create: { width: 2, height: 2, channels: 4, background: "red" } })
      .png().toBuffer();
    if (mode !== "rejected") writeFileSync(join(mediaDir, "a.png"), png);
    writeFileSync(join(mediaDir, "b.png"), png);
    const source = join(root, "dump.sql");
    const parent = mode === "missing" ? 999 : 20;
    writeFileSync(
      source,
      `USE \`scrich\`;
INSERT INTO \`drawings\` VALUES (1,'b',${parent},NULL,'2020-01-01 00:00:00'),(2,'b',${
        mode === "conflicting" ? "NULL" : mode === "missing" ? 999 : 10
      },NULL,'2020-01-01 00:00:00'),(10,'a',NULL,NULL,'2020-01-01 00:00:00'),(20,'a',NULL,NULL,'2020-01-01 00:00:00');\n`,
    );
    const options = {
      source,
      mediaDir,
      outputDir: join(root, "out"),
      rejectedDir: join(root, "rejected"),
    };
    if (mode !== "valid") {
      await expect(migrate(options)).rejects.toThrow(
        mode === "conflicting"
          ? "conflicting parents"
          : mode === "missing"
          ? "missing parent"
          : "media was rejected",
      );
      expect(existsSync(options.outputDir)).toBeFalse();
      return;
    }
    await migrate(options);
    const database = new DrawingDatabase(join(options.outputDir, "scrich.sqlite"), false);
    try {
      expect(database.find("b")?.parent).toBe(10);
      expect(database.find("a")?.parent).toBeNull();
    } finally {
      database.close();
    }
  });
}

for (const mode of ["invalid", "missing", "orphan", "derivative-only"] as const) {
  test(`does not reuse historical URLs from ${mode} media`, async () => {
    const root = mkdtempSync("/tmp/scrich-allocator-migration-");
    roots.push(root);
    const mediaDir = join(root, "legacy");
    mkdirSync(mediaDir);
    const png = await sharp({ create: { width: 2, height: 2, channels: 4, background: "red" } })
      .png().toBuffer();
    writeFileSync(join(mediaDir, "1.png"), png);
    const filename = mode === "derivative-only" ? "2-2x.png" : "2.png";
    if (mode !== "missing") writeFileSync(join(mediaDir, filename), "original rejected bytes");
    const source = join(root, "dump.sql");
    writeFileSync(
      source,
      `INSERT INTO \`drawings\` VALUES (100,'1',NULL,NULL,'2020-01-01 00:00:00')${
        mode === "invalid" || mode === "missing" ? ",(101,'2',NULL,NULL,'2020-01-01 00:00:00')" : ""
      };\n`,
    );
    const options = {
      source,
      mediaDir,
      outputDir: join(root, "output"),
      rejectedDir: join(root, "rejected"),
      database: "scrich" as const,
    };
    const report = await migrate(options);
    expect(report.nextDrawingValue).toBe(3);
    const db = new DrawingDatabase(join(options.outputDir, "scrich.sqlite"), false);
    try {
      const created = db.create({}, "2020-01-02T00:00:00Z", () => false, () => {});
      expect(created.shortId).toBe("3");
      expect(db.find("2")).toBeNull();
    } finally {
      db.close();
    }
    const manifest = readFileSync(report.rejectedManifest, "utf8").trim().split("\n").map(line =>
      JSON.parse(line)
    );
    const rejected = manifest.find(entry => entry.shortId === "2");
    expect(rejected).toBeDefined();
    if (mode !== "missing") {
      expect(rejected.files).toHaveLength(1);
      expect(rejected.files[0].sha256).toHaveLength(64);
      expect(readFileSync(rejected.files[0].copiedPath, "utf8")).toBe("original rejected bytes");
      expect(readFileSync(join(mediaDir, filename), "utf8")).toBe("original rejected bytes");
    }
  });
}
