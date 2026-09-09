import { Database } from "bun:sqlite";
import { statSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { decodeShortId } from "../src/id";
import { DrawingDatabase } from "../src/server/database";

try {
  const [action, shortId, ...extra] = process.argv.slice(2);
  if ((action !== "hide" && action !== "unhide") || !shortId || extra.length) {
    throw new Error("Usage: bun run drawing:hide|drawing:unhide <id>");
  }
  decodeShortId(shortId);
  const dataDir = process.env.DATA_DIR;
  if (!dataDir || !isAbsolute(dataDir)) {
    throw new Error("DATA_DIR must be an explicit absolute path");
  }
  const path = join(dataDir, "scrich.sqlite");
  if (!statSync(path, { throwIfNoEntry: false })?.isFile()) {
    throw new Error("DATA_DIR must contain an existing scrich.sqlite database");
  }
  // Reject unknown IDs before opening the database for schema upgrades or writes.
  const existing = new Database(path, { readonly: true });
  try {
    if (!existing.query("SELECT id FROM drawings WHERE short_id = ?").get(shortId)) {
      throw new Error(`Unknown drawing: ${shortId}`);
    }
  } finally {
    existing.close();
  }
  const database = new DrawingDatabase(path, false);
  try {
    const drawing = database.setVisibility(shortId, action === "hide" ? "hidden" : "visible");
    console.log(`${drawing.shortId}: ${drawing.visibility}`);
  } finally {
    database.close();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
