import { expect, test } from "bun:test";
import sharp from "sharp";
import { UploadError, validatePng } from "../../src/server/validate-upload";

test("rejects truncated PNGs during concurrent validation", async () => {
  const png = await sharp({
    create: { width: 100, height: 100, channels: 4, background: "red" },
  }).png().toBuffer();
  const truncated = new Uint8Array(png.subarray(0, png.length - 20));

  const results = await Promise.allSettled(
    Array.from({ length: 64 }, () => validatePng(truncated)),
  );

  expect(results.every((result) => {
    return result.status === "rejected"
      && result.reason instanceof UploadError
      && result.reason.code === "invalid";
  })).toBeTrue();
});
