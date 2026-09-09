import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { DrawingDatabase } from "../../src/server/database";

const directories: string[] = [];
afterEach(() =>
  directories.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true }))
);

async function run(dataDir: string | undefined, ...args: string[]) {
  const env = { ...process.env };
  delete env.DATA_DIR;
  if (dataDir !== undefined) env.DATA_DIR = dataDir;
  const child = Bun.spawn(
    [Bun.which("bun")!, resolve("scripts/drawing-visibility.ts"), ...args],
    {
      env,
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { code, stdout, stderr };
}

test("CLI requires existing explicit data, validates IDs, and applies reversible no-ops", async () => {
  const directory = mkdtempSync("/tmp/scrich-cli-test-");
  directories.push(directory);
  expect((await run(undefined, "hide", "1")).code).toBe(1);
  expect((await run("relative", "hide", "1")).code).toBe(1);
  expect((await run(directory, "hide", "1")).code).toBe(1);
  const path = join(directory, "scrich.sqlite");
  expect(existsSync(path)).toBeFalse();
  const database = new DrawingDatabase(path);
  try {
    const initial = database.create({}, "2026-01-01", () => false, () => {});
    for (const id of ["../1", "01", "0", "A", "!", "zzzzzzzzzzzzzzzz", "2"]) {
      expect((await run(directory, "hide", id)).code).toBe(1);
      expect(database.find("1")).toEqual(initial);
      expect(database.count()).toBe(1);
    }
    expect((await run(directory, "hide")).code).toBe(1);
    expect((await run(directory, "hide", "1", "extra")).code).toBe(1);
    for (const action of ["hide", "hide", "unhide", "unhide"]) {
      const state = action === "hide" ? "hidden" : "visible";
      const result = await run(directory, action, "1");
      expect(result).toEqual({ code: 0, stdout: `1: ${state}\n`, stderr: "" });
      expect(database.find("1")).toEqual({ ...initial, visibility: state });
      expect(database.raw.query("SELECT next_value FROM allocator").get()).toEqual({
        next_value: 2,
      });
    }
  } finally {
    database.close();
  }
});
