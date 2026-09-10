import { mkdirSync, statSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { loadConfig } from "../src/server/config";
import { DrawingDatabase } from "../src/server/database";
import { ImageService } from "../src/server/images";

export async function backfillDimensions(dataDir: string) {
  if (
    !isAbsolute(dataDir)
    || !statSync(join(dataDir, "scrich.sqlite"), { throwIfNoEntry: false })?.isFile()
  ) {
    throw new Error("DATA_DIR must be an absolute path containing an existing scrich.sqlite");
  }
  const config = loadConfig({ DATA_DIR: dataDir });
  const database = new DrawingDatabase(config.databasePath, false);
  const images = new ImageService(config);
  const result = { updated: 0, failed: 0 };
  try {
    mkdirSync(config.cacheDir, { recursive: true });
    let afterId = 0;
    for (;;) {
      const batch = database.missingCropDimensions(afterId);
      if (!batch.length) break;
      let cursor = 0;
      await Promise.all(Array.from({ length: 2 }, async () => {
        for (;;) {
          const drawing = batch[cursor++];
          if (!drawing) return;
          try {
            const { width, height } = await images.dimensions(drawing);
            database.setCropDimensions(drawing.shortId, width, height);
            result.updated++;
          } catch (error) {
            result.failed++;
            console.error(`${drawing.shortId}: ${error instanceof Error ? error.message : error}`);
          }
        }
      }));
      afterId = batch[batch.length - 1]!.id;
      console.log(`Updated ${result.updated}; failed ${result.failed}`);
    }
    return result;
  } finally {
    database.close();
  }
}

if (import.meta.main) {
  try {
    if (process.argv.length !== 2) {
      throw new Error("Usage: DATA_DIR=/path bun run drawing:backfill-dimensions");
    }
    const result = await backfillDimensions(process.env.DATA_DIR ?? "");
    console.log(JSON.stringify(result));
    if (result.failed) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
