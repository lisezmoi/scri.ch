import { Database } from "bun:sqlite";
import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { DrawingDatabase } from "../../src/server/database";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("allocates unique sequential IDs and skips occupied files", () => {
  const directory = mkdtempSync("/tmp/scrich-database-test-");
  directories.push(directory);
  const database = new DrawingDatabase(join(directory, "test.sqlite"));
  const occupied = new Set(["1"]);
  try {
    const first = database.create({}, "2026-01-01T00:00:00Z", (id) => occupied.has(id), () => {});
    const second = database.create({}, "2026-01-01T00:00:01Z", () => false, () => {});
    expect([first.shortId, second.shortId]).toEqual(["2", "3"]);
    expect(database.count()).toBe(2);
  } finally {
    database.close();
  }
});

test("rolls back allocation when file finalization fails", () => {
  const directory = mkdtempSync("/tmp/scrich-database-test-");
  directories.push(directory);
  const database = new DrawingDatabase(join(directory, "test.sqlite"));
  try {
    expect(() =>
      database.create({}, "2026-01-01T00:00:00Z", () => false, () => {
        throw new Error("rename failed");
      })
    ).toThrow("rename failed");
    expect(database.count()).toBe(0);
    expect(database.create({}, "2026-01-01T00:00:01Z", () => false, () => {}).shortId).toBe("1");
  } finally {
    database.close();
  }
  expect(existsSync(directory)).toBeTrue();
});

test("upgrades legacy schemas repeatedly while preserving rows and allocator", () => {
  const directory = mkdtempSync("/tmp/scrich-database-test-");
  directories.push(directory);
  const path = join(directory, "test.sqlite");
  const legacy = new Database(path);
  legacy.exec(`
    CREATE TABLE drawings (id INTEGER PRIMARY KEY AUTOINCREMENT, short_id TEXT NOT NULL UNIQUE,
      settings_json TEXT NOT NULL, created_at TEXT NOT NULL);
    INSERT INTO drawings VALUES (17, 'b', '{}', '2026-01-01');
    CREATE TABLE allocator (singleton INTEGER PRIMARY KEY, next_value INTEGER NOT NULL);
    INSERT INTO allocator VALUES (1, 99);
  `);
  legacy.close();
  for (let attempt = 0; attempt < 3; attempt++) {
    const database = new DrawingDatabase(path);
    try {
      expect(database.find("b")).toEqual({
        parent: null,
        id: 17,
        shortId: "b",
        settings: {},
        createdAt: "2026-01-01",
        visibility: "visible",
      });
      expect(database.raw.query("SELECT next_value FROM allocator").get()).toEqual({
        next_value: 99,
      });
      expect(database.raw.query("SELECT seq FROM sqlite_sequence WHERE name = 'drawings'").get())
        .toEqual({ seq: 17 });
      expect(() => database.raw.exec("UPDATE drawings SET visibility = 'invalid'")).toThrow();
    } finally {
      database.close();
    }
  }
  const database = new DrawingDatabase(path);
  try {
    database.insertImported({ id: 18, shortId: "c", settings: {}, createdAt: "2026-01-02" });
    expect(database.find("c")?.visibility).toBe("visible");
    expect(database.create({}, "2026-01-03", () => false, () => {}).visibility).toBe("visible");
  } finally {
    database.close();
  }
});

test("preserves parent relationships across repeated upgrades", () => {
  const directory = mkdtempSync("/tmp/scrich-parent-test-");
  directories.push(directory);
  const path = join(directory, "test.sqlite");
  let database = new DrawingDatabase(path);
  database.insertImported({ id: 17, shortId: "b", settings: {}, createdAt: "2026-01-01" });
  const child = database.create({}, "2026-01-02", () => false, () => {}, "b");
  database.close();
  for (let i = 0; i < 3; i++) {
    database = new DrawingDatabase(path);
    expect(database.find(child.shortId)?.parent).toBe(17);
    expect(database.list(0, 10).find(row => row.shortId === child.shortId)?.parent).toBe(17);
    database.close();
  }
});
