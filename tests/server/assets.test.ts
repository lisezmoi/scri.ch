import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { build } from "../../scripts/build";
import { createApp } from "../../src/server/app";
import { loadAssets } from "../../src/server/assets";
import { loadConfig } from "../../src/server/config";
import { renderDrawingPage } from "../../src/server/html";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});
function fixture() {
  const directory = mkdtempSync("/tmp/scrich-assets-test-");
  directories.push(directory);
  return directory;
}

test("startup rejects missing, invalid, and incomplete builds before creating data", async () => {
  const directory = fixture();
  const dataDir = join(directory, "data");
  const config = loadConfig({ DATA_DIR: dataDir });
  expect(() => createApp(config, directory)).toThrow("bun run build");
  expect(existsSync(dataDir)).toBeFalse();
  writeFileSync(join(directory, "manifest.json"), "{}");
  expect(() => loadAssets(directory)).toThrow("bun run build");
  const manifest = await build(directory);
  rmSync(join(directory, manifest["scrich.js"].slice("/assets/".length)));
  expect(() => createApp(config, directory)).toThrow("bun run build");
  expect(existsSync(dataDir)).toBeFalse();
});

test("builds are deterministic and production pins its manifest while development reads rebuilds", async () => {
  const directory = fixture();
  const original = await build(directory);
  expect(await build(directory)).toEqual(original);
  const config = loadConfig({ DATA_DIR: join(directory, "data") });
  const development = createApp(config, directory);
  const production = createApp({ ...config, debug: false }, directory);
  try {
    const rebuilt = await build(directory, true);
    expect(rebuilt["scrich.js"]).not.toBe(original["scrich.js"]);
    for (
      const [app, manifest, cache] of [
        [development, rebuilt, "no-store"],
        [production, original, "public, max-age=31536000, immutable"],
      ] as const
    ) {
      const page = await (await app.fetch(new Request("https://scri.ch/"))).text();
      expect(page).toContain(manifest["scrich.js"]);
      const response = await app.fetch(new Request(`https://scri.ch${manifest["scrich.js"]}`));
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe(cache);
      expect(await response.text()).toBe(
        readFileSync(join(directory, manifest["scrich.js"].slice(8)), "utf8"),
      );
    }
  } finally {
    development.close();
    production.close();
  }
});

test("page bootstrap is inert JSON and escapes script-closing input", async () => {
  const directory = fixture();
  const clientAssets = await build(directory);
  const body = renderDrawingPage({
    ...loadConfig({ DATA_DIR: directory }),
    publicOrigin: "https://example.org/</script><script>alert(1)</script>",
    clientAssets,
  }, { background: "#123456" });
  expect(body).not.toContain("<script>alert(1)</script>");
  expect(body).not.toContain("SCRICH_SETTINGS");
  const json = /<script id="drawing-data" type="application\/json">(.*?)<\/script>/s.exec(
    body,
  )![1]!;
  expect(JSON.parse(json).settings).toEqual({ background: "#123456" });
  expect(JSON.parse(json).drawingUrl).toBeNull();
});

test("cached stats HTML picks up rebuilt stylesheets and scripts immediately", async () => {
  const directory = fixture();
  const original = await build(directory);
  const app = createApp(loadConfig({ DATA_DIR: join(directory, "data") }), directory);
  try {
    const request = new Request("https://scri.ch/stats");
    expect(await (await app.fetch(request)).text()).toContain(original["admin.css"]);
    const rebuilt = await build(directory, true);
    expect(rebuilt["admin.css"]).not.toBe(original["admin.css"]);
    const body = await (await app.fetch(request)).text();
    for (const asset of ["admin.css", "stats.js"] as const) {
      expect(body).toContain(rebuilt[asset]);
      expect((await app.fetch(new Request(`https://scri.ch${rebuilt[asset]}`))).status).toBe(200);
    }
  } finally {
    app.close();
  }
});
