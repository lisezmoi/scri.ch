import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { type Browser, chromium, type Page } from "playwright";
import sharp from "sharp";
import { build } from "../../scripts/build";
import { createApp, type ScrichApp } from "../../src/server/app";
import { loadConfig } from "../../src/server/config";

const directory = mkdtempSync("/tmp/scrich-browser-test-");
let app: ScrichApp;
let server: ReturnType<typeof Bun.serve>;
let browser: Browser;
beforeAll(async () => {
  const assets = join(directory, "assets");
  await build(assets);
  app = createApp(loadConfig({ DATA_DIR: join(directory, "data") }), assets);
  server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: app.fetch });
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser?.close();
  await server?.stop(true);
  app?.close();
  rmSync(directory, { recursive: true, force: true });
});

async function open(page: Page, path = "/") {
  await page.goto(new URL(path, server.url).href);
  await page.waitForFunction(() => {
    const canvas = document.querySelector("canvas")!;
    const data = JSON.parse(document.querySelector("#drawing-data")!.textContent!);
    const margin = data.settings.size ? 0 : (data.settings.margin ?? 0);
    return canvas.width === (data.settings.size?.width || window.innerWidth - margin * 2)
      && canvas.height === (data.settings.size?.height || window.innerHeight - margin * 2);
  });
}

async function save(page: Page) {
  const response = page.waitForResponse((response) => response.request().method() === "POST");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const saved = await response;
  expect(saved.status()).toBe(303);
  const location = saved.headers()["location"]!;
  await page.waitForURL(new URL(location, server.url).href);
  await page.waitForFunction(() => document.querySelector("canvas")!.width === window.innerWidth);
  return location;
}

async function pixels(path: string) {
  const response = await app.fetch(new Request(new URL(`${path}-raw.png`, server.url)));
  return sharp(await response.arrayBuffer()).ensureAlpha().raw().toBuffer({
    resolveWithObject: true,
  });
}

function pixel(image: Awaited<ReturnType<typeof pixels>>, x: number, y: number) {
  const start = (y * image.info.width + x) * 4;
  return [...image.data.subarray(start, start + 4)];
}

test(
  "mouse drawing survives resizing, saves legacy dimensions, and can be reopened and forked",
  async () => {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    try {
      await open(page);
      await page.mouse.move(40, 50);
      await page.mouse.down();
      await page.mouse.move(200, 100, { steps: 3 });
      await page.mouse.up();
      await page.setViewportSize({ width: 650, height: 450 });
      await page.waitForFunction(() => document.querySelector("canvas")!.width === 650);
      const first = await save(page);
      const original = await pixels(first);
      expect([original.info.width, original.info.height]).toEqual([201, 101]);
      expect(pixel(original, 39, 49)).toEqual([0, 0, 0, 255]);
      expect(pixel(original, 0, 0)).toEqual([0, 0, 0, 0]);
      await page.mouse.click(250, 150);
      const second = await save(page);
      expect(second).not.toBe(first);
      const source = app.database.find(first.slice(1))!;
      expect(source.parent).toBeNull();
      expect(app.database.find(second.slice(1))?.parent).toBe(source.id);
      const fork = await pixels(second);
      expect([fork.info.width, fork.info.height]).toEqual([251, 151]);
      expect(pixel(fork, 39, 49)).toEqual(pixel(original, 39, 49));
      expect(pixel(fork, 249, 149)).toEqual([0, 0, 0, 255]);
      expect((await pixels(first)).data).toEqual(original.data);
      expect(errors).toEqual([]);
    } finally {
      await page.close();
    }
  },
  30_000,
);

test("touch drawing respects fixed dimensions and colors", async () => {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 }, hasTouch: true });
  try {
    await open(page, "/?size=300x200&background=ff0000&foreground=00ff00&margin=20");
    // The fixed canvas starts at (250, 200), independently of the ignored margin.
    await page.touchscreen.tap(280, 240);
    const response = page.waitForResponse((response) => response.request().method() === "POST");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    const saved = await response;
    expect(saved.status()).toBe(303);
    const original = await pixels(saved.headers()["location"]!);
    expect([original.info.width, original.info.height]).toEqual([300, 200]);
    expect(pixel(original, 29, 39)).toEqual([0, 255, 0, 255]);
    expect(pixel(original, 0, 0)).toEqual([255, 0, 0, 255]);
  } finally {
    await page.close();
  }
}, 30_000);

test("cancelled pointers stop drawing and later strokes still work", async () => {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  try {
    await open(page);
    await page.mouse.move(20, 20);
    await page.mouse.down();
    await page.evaluate(() => {
      document.querySelector("canvas")!.dispatchEvent(
        new PointerEvent("pointercancel", { pointerId: 1 }),
      );
    });
    await page.mouse.move(400, 300);
    await page.mouse.up();
    await page.mouse.click(50, 50);
    const image = await pixels(await save(page));
    expect([image.info.width, image.info.height]).toEqual([51, 51]);
    expect(pixel(image, 19, 19)).toEqual([0, 0, 0, 255]);
    expect(pixel(image, 49, 49)).toEqual([0, 0, 0, 255]);
    expect(pixel(image, 35, 35)).toEqual([0, 0, 0, 0]);
  } finally {
    await page.close();
  }
}, 30_000);

test("margins offset coordinates and captured strokes continue outside the canvas", async () => {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  try {
    await open(page, "/?margin=20");
    await page.mouse.move(40, 50);
    await page.mouse.down();
    await page.mouse.move(790, 50);
    await page.mouse.up();
    const response = page.waitForResponse((response) => response.request().method() === "POST");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    const saved = await response;
    expect(saved.status()).toBe(303);
    const image = await pixels(saved.headers()["location"]!);
    expect([image.info.width, image.info.height]).toEqual([760, 31]);
    expect(pixel(image, 19, 29)).toEqual([0, 0, 0, 255]);
    expect(pixel(image, 759, 29)[3]).toBeGreaterThan(0);
  } finally {
    await page.close();
  }
}, 30_000);

for (
  const [size, width, height] of [
    ["300", 300, 300],
    ["300x200", 300, 200],
    ["300x", 300, 600],
    ["x300", 800, 300],
  ] as const
) {
  test(`size=${size} saves and reopens the full ${width}x${height} canvas`, async () => {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    try {
      await open(page, `/?size=${size}`);
      const canvas = page.locator("canvas");
      const bounds = (await canvas.boundingBox())!;
      await page.mouse.click(bounds.x + 30, bounds.y + 40);
      const response = page.waitForResponse((response) => response.request().method() === "POST");
      await page.getByRole("button", { name: "Save", exact: true }).click();
      const saved = await response;
      expect(saved.status()).toBe(303);
      const location = saved.headers()["location"]!;
      const original = await pixels(location);
      expect([original.info.width, original.info.height]).toEqual([width, height]);
      expect(pixel(original, 29, 39)).toEqual([0, 0, 0, 255]);
      expect(app.database.find(location.slice(1))!.settings.size).toEqual({ width, height });
      await page.waitForURL(new URL(location, server.url).href);
      await page.setViewportSize({ width: 1000, height: 750 });
      await open(page, location);
      expect(await canvas.evaluate((element: HTMLCanvasElement) => [element.width, element.height]))
        .toEqual([
          width,
          height,
        ]);
      const exported = await app.fetch(new Request(new URL(`${location}.png`, server.url)));
      const exportedBytes = await exported.arrayBuffer();
      const exportedMetadata = await sharp(exportedBytes).metadata();
      expect([exportedMetadata.width, exportedMetadata.height, exportedMetadata.hasAlpha])
        .toEqual([width, height, false]);
      expect([...(await sharp(exportedBytes).raw().toBuffer()).subarray(0, 3)]).toEqual([
        255,
        255,
        255,
      ]);
      const cropped = await app.fetch(new Request(new URL(`${location}-cropped.png`, server.url)));
      const metadata = await sharp(await cropped.arrayBuffer()).metadata();
      expect([metadata.width, metadata.height]).toEqual([2, 2]);
    } finally {
      await page.close();
    }
  }, 30_000);
}
