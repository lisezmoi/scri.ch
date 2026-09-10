import { expect, spyOn, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { backfillDimensions } from "../../scripts/backfill-dimensions";
import { DrawingDatabase } from "../../src/server/database";

test("backfill uses bounded batches, skips known dimensions and retries failures on rerun", async () => {
  const root = mkdtempSync("/tmp/scrich-backfill-");
  const db = new DrawingDatabase(join(root, "scrich.sqlite"));
  const log = spyOn(console, "error").mockImplementation(() => {});
  try {
    const dir = join(root, "drawings");
    mkdirSync(dir);
    const png = await sharp({
      create: { width: 12, height: 8, channels: 4, background: "transparent" },
    }).png().toBuffer();
    for (let i = 1; i <= 102; i++) {
      const id = i.toString(36);
      db.insertImported({ id: i, shortId: id, settings: {}, createdAt: "2026-01-01" });
      if (i < 102) writeFileSync(join(dir, id + ".png"), png);
    }
    db.setCropDimensions("1", 12, 8);
    db.setVisibility("2", "hidden");
    expect(await backfillDimensions(root)).toEqual({ updated: 100, failed: 1 });
    expect(db.find("1")).toMatchObject({ cropWidth: 12, cropHeight: 8 });
    const blank = await sharp(join(root, "cache/v3/2-crop.png")).metadata();
    expect(db.find("2")).toMatchObject({ cropWidth: blank.width, cropHeight: blank.height });
    const failedRun = Bun.spawnSync([process.execPath, "scripts/backfill-dimensions.ts"], {
      env: { ...process.env, DATA_DIR: root },
    });
    expect(failedRun.exitCode).toBe(1);
    expect(failedRun.stderr.toString()).toContain((102).toString(36));
    expect(db.find((102).toString(36))?.cropWidth).toBeNull();
    writeFileSync(join(dir, (102).toString(36) + ".png"), png);
    expect(await backfillDimensions(root)).toEqual({ updated: 1, failed: 0 });
    expect(await backfillDimensions(root)).toEqual({ updated: 0, failed: 0 });
    expect(log).toHaveBeenCalled();
    const result = Bun.spawnSync([process.execPath, "scripts/backfill-dimensions.ts"], {
      env: { ...process.env, DATA_DIR: join(root, "absent") },
    });
    expect(result.exitCode).toBe(1);
  } finally {
    db.close();
    log.mockRestore();
    rmSync(root, { recursive: true, force: true });
  }
});
