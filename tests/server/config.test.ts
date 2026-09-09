import { expect, test } from "bun:test";
import { loadConfig } from "../../src/server/config";

test("loads safe development defaults", () => {
  const config = loadConfig({});
  expect(config.port).toBe(3000);
  expect(config.dataDir).toBe("/tmp/scrich-development");
  expect(config.galleryCredentials).toBeNull();
});

test("requires explicit production paths and origin", () => {
  expect(() => loadConfig({ NODE_ENV: "production" })).toThrow("DATA_DIR");
  expect(() => loadConfig({ NODE_ENV: "production", DATA_DIR: "/srv/scrich" })).toThrow(
    "PUBLIC_ORIGIN",
  );
});

test("does not accept half-configured gallery credentials", () => {
  expect(() => loadConfig({ GALLERY_USERNAME: "admin" })).toThrow("configured together");
});

test("export limits are configurable independently of upload limits", () => {
  expect(loadConfig({}).maxExportPixels).toBe(160_000_000);
  expect(loadConfig({ MAX_EXPORT_PIXELS: "200000000" }).maxExportPixels).toBe(200_000_000);
  for (const value of ["", "0", "-1", "1.5", "Infinity", "bad", "9007199254740992"]) {
    expect(() => loadConfig({ MAX_EXPORT_PIXELS: value })).toThrow("MAX_EXPORT_PIXELS");
  }
});
