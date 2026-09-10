import { expect, test } from "bun:test";
import { loadConfig } from "../../src/server/config";

test("loads safe development defaults", () => {
  const config = loadConfig({});
  expect(config.port).toBe(3000);
  expect(config.dataDir).toBe("/tmp/scrich-development");
  expect(config.galleryPassword).toBeNull();
  expect(config.statsPassword).toBeNull();
});

test("requires explicit production paths and origin", () => {
  expect(() => loadConfig({ NODE_ENV: "production" })).toThrow("DATA_DIR");
  expect(() => loadConfig({ NODE_ENV: "production", DATA_DIR: "/srv/scrich" })).toThrow(
    "PUBLIC_ORIGIN",
  );
});

test("export limits are configurable independently of upload limits", () => {
  expect(loadConfig({}).maxExportPixels).toBe(160_000_000);
  expect(loadConfig({ MAX_EXPORT_PIXELS: "200000000" }).maxExportPixels).toBe(200_000_000);
  for (const value of ["", "0", "-1", "1.5", "Infinity", "bad", "9007199254740992"]) {
    expect(() => loadConfig({ MAX_EXPORT_PIXELS: value })).toThrow("MAX_EXPORT_PIXELS");
  }
});

test("page passwords independently decide whether access is public", () => {
  expect(loadConfig({ GALLERY_PASSWORD: "gallery" })).toMatchObject({
    galleryPassword: "gallery",
    statsPassword: null,
  });
  expect(loadConfig({ STATS_PASSWORD: "stats" })).toMatchObject({
    galleryPassword: null,
    statsPassword: "stats",
  });
  expect(loadConfig({ GALLERY_PASSWORD: "gallery", STATS_PASSWORD: "stats" })).toMatchObject({
    galleryPassword: "gallery",
    statsPassword: "stats",
  });
  expect(loadConfig({ GALLERY_PASSWORD: "", STATS_PASSWORD: "" })).toMatchObject({
    galleryPassword: null,
    statsPassword: null,
  });
});
