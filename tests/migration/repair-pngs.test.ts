import { expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { repairPngs } from "../../scripts/migration/repair-pngs";

test(
  "repairs truncated browser-readable PNGs separately, preserves originals, and reports failures",
  async () => {
    const root = mkdtempSync("/tmp/scrich-repair-test-");
    try {
      const mediaDir = join(root, "media");
      const outputDir = join(root, "repairs");
      mkdirSync(mediaDir);
      const raw = Buffer.alloc(64 * 64 * 4);
      for (let i = 0; i < raw.length; i += 4) {
        raw[i] = (i * 19) % 251;
        raw[i + 1] = (i * 31) % 253;
        raw[i + 2] = (i * 43) % 255;
        raw[i + 3] = 255;
      }
      const valid = await sharp(raw, { raw: { width: 64, height: 64, channels: 4 } }).png()
        .toBuffer();
      let offset = 8;
      while (valid.toString("ascii", offset + 4, offset + 8) !== "IDAT") {
        offset += valid.readUInt32BE(offset) + 12;
      }
      const truncated = valid.subarray(
        0,
        offset + 8 + Math.floor(valid.readUInt32BE(offset) * 0.75),
      );
      writeFileSync(join(mediaDir, "1.png"), valid);
      writeFileSync(join(mediaDir, "2.png"), truncated);
      writeFileSync(join(mediaDir, "3.png"), "bad");
      writeFileSync(join(mediaDir, "4.png"), "");
      await expect(sharp(truncated, { failOn: "error" }).png().toBuffer()).rejects.toThrow();
      const report = await repairPngs({ mediaDir, outputDir });
      expect(report.counts).toEqual({ valid: 1, repaired: 1, unrecoverable: 2 });
      expect(readFileSync(join(mediaDir, "2.png"))).toEqual(truncated);
      expect(existsSync(join(outputDir, "drawings", "1.png"))).toBeFalse();
      const repaired = await sharp(join(outputDir, "drawings", "2.png"), { failOn: "error" }).raw()
        .toBuffer({ resolveWithObject: true });
      expect(repaired.info.width).toBe(64);
      expect(repaired.info.height).toBe(64);
      const records = readFileSync(join(outputDir, "manifest.jsonl"), "utf8").trim().split("\n")
        .map(line => JSON.parse(line));
      expect(records.find(r => r.id === "2").outputSha256).toHaveLength(64);
      await expect(repairPngs({ mediaDir, outputDir })).rejects.toThrow();
      await expect(repairPngs({ mediaDir, outputDir: join(root, "other"), ids: ["../1"] })).rejects
        .toThrow("Invalid drawing ID");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
  30_000,
);
