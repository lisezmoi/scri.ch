import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import sharp from "sharp";
import { build } from "../../scripts/build";
import { createApp } from "../../src/server/app";
import { loadConfig } from "../../src/server/config";

test("gallery reserves image space before loading on wide and narrow screens", async () => {
  const root = mkdtempSync("/tmp/scrich-gallery-");
  const assets = join(root, "assets");
  await build(assets);
  const config = loadConfig({
    DATA_DIR: join(root, "data"),
    GALLERY_PASSWORD: "pass",
  });
  const app = createApp(config, assets);
  const server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: app.fetch });
  const browser = await chromium.launch();
  try {
    for (let id = 1; id <= 3; id++) {
      const width = id === 3 ? 1000 : 200, height = id === 3 ? 400 : 100;
      app.database.insertImported({
        id,
        shortId: String(id),
        settings: { size: { width, height } },
        createdAt: "2026-01-01",
      });
      writeFileSync(
        join(config.drawingsDir, id + ".png"),
        await sharp({ create: { width, height, channels: 4, background: "red" } }).png().toBuffer(),
      );
      if (id > 1) app.database.setCropDimensions(String(id), width, height);
    }
    for (const width of [1400, 400]) {
      const page = await browser.newPage({
        viewport: { width, height: 1000 },
        httpCredentials: { username: "", password: "pass" },
      });
      let release!: () => void;
      const ready = new Promise<void>(resolve => {
        release = resolve;
      });
      await page.route(/\/\d+\.png$/, async route => {
        await ready;
        await route.continue();
      });
      try {
        await page.goto(new URL("/gallery", server.url).href, { waitUntil: "domcontentloaded" });
        const boxes = () =>
          page.locator("#drawing-list img").evaluateAll(images =>
            images.slice(0, 2).map(image => {
              const r = image.getBoundingClientRect();
              return { x: r.x, y: r.y, width: r.width, height: r.height };
            })
          );
        const before = await boxes();
        expect(before[0]!.height).toBeGreaterThan(0);
        expect(before[0]!.width).toBeLessThanOrEqual(width);
        expect(await page.locator("#drawing-list img[src=\"/1.png\"]").getAttribute("width"))
          .toBeNull();
        release();
        await page.waitForFunction(() =>
          [...document.querySelectorAll<HTMLImageElement>("#drawing-list img")].every(image =>
            image.complete && image.naturalWidth > 0
          )
        );
        expect(await boxes()).toEqual(before);
      } finally {
        release();
        await page.close();
      }
    }
  } finally {
    await browser.close();
    await server.stop(true);
    app.close();
    rmSync(root, { recursive: true, force: true });
  }
}, 30_000);
