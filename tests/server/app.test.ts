import { afterAll, afterEach, expect, spyOn, test } from "bun:test";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { build } from "../../scripts/build";
import { createApp, type ScrichApp } from "../../src/server/app";
import { loadAssets } from "../../src/server/assets";
import type { AppConfig } from "../../src/server/config";
import { DrawingDatabase } from "../../src/server/database";
import { ImageService } from "../../src/server/images";

const assetDirectory = mkdtempSync("/tmp/scrich-test-assets-");
await build(assetDirectory);
afterAll(() => rmSync(assetDirectory, { recursive: true, force: true }));

const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));

function appWithData(): { app: ScrichApp; config: AppConfig; } {
  const dataDir = mkdtempSync("/tmp/scrich-app-test-");
  const config: AppConfig = {
    debug: true,
    maxExportPixels: 160_000_000,
    host: "127.0.0.1",
    port: 3000,
    publicOrigin: "https://scri.ch",
    dataDir,
    drawingsDir: join(dataDir, "drawings"),
    cacheDir: join(dataDir, "cache", "v3"),
    temporaryDir: join(dataDir, "tmp"),
    databasePath: join(dataDir, "scrich.sqlite"),
    galleryCredentials: { username: "viewer", password: "secret" },
  };
  const app = createApp(config, assetDirectory);
  cleanups.push(() => {
    app.close();
    rmSync(dataDir, { recursive: true, force: true });
  });
  return { app, config };
}

async function postPng(app: ScrichApp, parent?: string): Promise<Response> {
  const png = await sharp({
    create: { width: 20, height: 10, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).png().toBuffer();
  const body = new URLSearchParams({
    new_drawing: png.toString("base64"),
    settings: JSON.stringify({ foreground: "#000" }),
  });
  if (parent !== undefined) body.set("parent", parent);
  return await app.fetch(
    new Request("https://scri.ch/", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    }),
  );
}

test("saves, renders, and serves raw drawings", async () => {
  const { app } = appWithData();
  const response = await postPng(app);
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe("/1");
  expect((await app.fetch(new Request("https://scri.ch/1"))).status).toBe(200);
  const raw = await app.fetch(new Request("https://scri.ch/1-raw.png"));
  expect(raw.status).toBe(200);
  expect(raw.headers.get("content-type")).toBe("image/png");
});

test("rejects malformed uploads without allocating an ID", async () => {
  const { app } = appWithData();
  const body = new URLSearchParams({ new_drawing: "bm90IGEgcG5n", settings: "{}" });
  const response = await app.fetch(
    new Request("https://scri.ch/", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    }),
  );
  expect(response.status).toBe(422);
  expect(app.database.count()).toBe(0);
});

test("rejects malformed form bodies without allocating an ID", async () => {
  const { app } = appWithData();
  const response = await app.fetch(
    new Request("https://scri.ch/", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "not form data",
    }),
  );
  expect(response.status).toBe(422);
  expect(app.database.count()).toBe(0);
});

test("rejects malformed settings without allocating an ID", async () => {
  const { app } = appWithData();
  const png = await sharp({
    create: { width: 2, height: 2, channels: 4, background: "red" },
  }).png().toBuffer();
  const response = await app.fetch(
    new Request("https://scri.ch/", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ new_drawing: png.toString("base64"), settings: "{" }),
    }),
  );
  expect(response.status).toBe(422);
  expect(app.database.count()).toBe(0);
});

test("allocates unique IDs for concurrent saves", async () => {
  const { app, config } = appWithData();
  const responses = await Promise.all(Array.from({ length: 20 }, () => postPng(app)));
  expect(responses.every((response) => response.status === 303)).toBeTrue();
  const locations = responses.map((response) => response.headers.get("location"));
  expect(new Set(locations).size).toBe(20);
  expect(app.database.count()).toBe(20);
  expect(readdirSync(config.drawingsDir).filter((name) => name.endsWith(".png"))).toHaveLength(20);
});

test("protects gallery and validates page numbers", async () => {
  const { app } = appWithData();
  expect((await app.fetch(new Request("https://scri.ch/gallery"))).status).toBe(401);
  const headers = { authorization: `Basic ${Buffer.from("viewer:secret").toString("base64")}` };
  expect((await app.fetch(new Request("https://scri.ch/gallery?p=0", { headers }))).status).toBe(
    400,
  );
  expect((await app.fetch(new Request("https://scri.ch/gallery", { headers }))).status).toBe(200);
});

test("generates documented zoom levels", async () => {
  const { app } = appWithData();
  await postPng(app);
  const response = await app.fetch(new Request("https://scri.ch/1-2x.png"));
  expect(response.status).toBe(200);
  const metadata = await sharp(await response.arrayBuffer()).metadata();
  expect(metadata.width).toBe(120);
  expect(metadata.height).toBe(100);
  expect((await app.fetch(new Request("https://scri.ch/1-5x.png"))).status).toBe(404);
});

test("visibility updates from another connection protect every route and retain bytes", async () => {
  const { app, config } = appWithData();
  await postPng(app);
  const paths = ["/1-raw.png", "/1.png", "/1-cropped.png", "/1-2x.png", "/1-3x.png", "/1-4x.png"];
  const originals = new Map<string, { bytes: ArrayBuffer; etag: string; }>();
  for (const path of paths) {
    const response = await app.fetch(new Request(`https://scri.ch${path}`));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=300, must-revalidate");
    const etag = response.headers.get("etag")!;
    expect(etag).toBeTruthy();
    originals.set(path, { bytes: await response.arrayBuffer(), etag });
    const conditional = await app.fetch(
      new Request(`https://scri.ch${path}`, {
        headers: { "if-none-match": etag },
      }),
    );
    expect(conditional.status).toBe(304);
    expect(await conditional.text()).toBe("");
  }
  const croppedMetadata = await sharp(originals.get("/1-cropped.png")!.bytes).metadata();
  const paddedMetadata = await sharp(originals.get("/1.png")!.bytes).metadata();
  expect([croppedMetadata.width, croppedMetadata.height]).toEqual([20, 10]);
  expect([paddedMetadata.width, paddedMetadata.height]).toEqual([60, 50]);
  const other = new DrawingDatabase(config.databasePath, false);
  try {
    other.setVisibility("1", "hidden");
    const authorization = `Basic ${Buffer.from("viewer:secret").toString("base64")}`;
    const missing = await (await app.fetch(new Request("https://scri.ch/missing"))).text();
    expect(missing).toContain("<title>404 Not Found | scri.ch</title>");
    expect(missing).toContain("/404-raw.png");
    expect(missing).not.toContain("id=\"error\"");
    for (const path of ["/1", ...paths]) {
      const response = await app.fetch(
        new Request(`https://scri.ch${path}`, {
          headers: { authorization, "if-none-match": originals.get(path)?.etag ?? "*" },
        }),
      );
      expect(response.status).toBe(404);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.text()).toBe(missing);
    }
    const gallery = await app.fetch(
      new Request("https://scri.ch/gallery", { headers: { authorization } }),
    );
    expect(gallery.headers.get("cache-control")).toBe("no-store");
    const body = await gallery.text();
    expect(body).toContain("Hidden");
    expect(body).toContain("total 1");
    expect(body).not.toContain("href=\"/1\"");
    expect(body).not.toContain("src=\"/1.png\"");
    other.setVisibility("1", "visible");
    for (const path of paths) {
      const response = await app.fetch(new Request(`https://scri.ch${path}`));
      expect(response.status).toBe(200);
      expect(await response.arrayBuffer()).toEqual(originals.get(path)!.bytes);
    }
    const page = await app.fetch(new Request("https://scri.ch/1"));
    expect(page.status).toBe(200);
    expect(page.headers.get("cache-control")).toBe("no-store");
  } finally {
    other.close();
  }
});

test("hiding while generation is pending prevents bytes and conditional responses", async () => {
  const { app, config } = appWithData();
  await postPng(app);
  const original = ImageService.prototype.resolve;
  for (const conditional of [false, true]) {
    app.database.setVisibility("1", "visible");
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const spy = spyOn(ImageService.prototype, "resolve").mockImplementation(
      async function(this: ImageService, drawing, mode) {
        started();
        await gate;
        return original.call(this, drawing, mode);
      },
    );
    const other = new DrawingDatabase(config.databasePath, false);
    try {
      const pending = app.fetch(
        new Request("https://scri.ch/1-2x.png", {
          headers: conditional ? { "if-none-match": "*" } : {},
        }),
      );
      await entered;
      other.setVisibility("1", "hidden");
      release();
      const response = await pending;
      expect(response.status).toBe(404);
      expect(response.headers.get("cache-control")).toBe("no-store");
    } finally {
      release();
      spy.mockRestore();
      other.close();
    }
  }
});

test("serves browser TypeScript and CSS builds in development and production", async () => {
  const { app, config } = appWithData();
  for (const debug of [true, false]) {
    config.debug = debug;
    const page = await (await app.fetch(new Request("https://scri.ch/"))).text();
    const manifest = loadAssets(assetDirectory);
    expect(page).toContain(`type="module" src="${manifest["scrich.js"]}"`);
    expect(page).not.toContain("SCRICH_SETTINGS");
    for (const asset of ["scrich.js", "scrich.css", "admin.css"] as const) {
      const response = await app.fetch(new Request(`https://scri.ch${manifest[asset]}`));
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe(
        asset.endsWith(".css") ? "text/css;charset=utf-8" : "text/javascript;charset=utf-8",
      );
      expect(response.headers.get("cache-control")).toBe(
        debug ? "no-store" : "public, max-age=31536000, immutable",
      );
      const body = await response.text();
      if (asset.endsWith(".js")) {
        expect(body).toContain("toDataURL");
        expect(body).not.toContain("Firefox 3.6");
      } else {
        expect(body).toContain(asset === "admin.css" ? "#drawing-list" : "canvas");
      }
    }
  }
});

test("query options on saved drawings and PNG URLs do not override stored settings", async () => {
  const { app } = appWithData();
  await postPng(app);
  const query = "?background=ff0000&foreground=00ff00&size=100x100&margin=7";
  for (const path of ["/1", "/1.png", "/1-raw.png", "/1-cropped.png", "/1-2x.png"]) {
    const expected = await app.fetch(new Request(`https://scri.ch${path}`));
    const actual = await app.fetch(new Request(`https://scri.ch${path}${query}`));
    expect(actual.status).toBe(200);
    expect(await actual.arrayBuffer()).toEqual(await expected.arrayBuffer());
  }
});

test("records immediate parents and rejects invalid parents without files or allocation", async () => {
  const { app, config } = appWithData();
  await postPng(app);
  expect(app.database.find("1")?.parent).toBeNull();
  expect((await postPng(app, "1")).status).toBe(303);
  expect((await postPng(app, "2")).status).toBe(303);
  expect(app.database.find("2")?.parent).toBe(app.database.find("1")!.id);
  expect(app.database.find("3")?.parent).toBe(app.database.find("2")!.id);
  app.database.setVisibility("1", "hidden");
  for (const parent of ["1", "missing", "01", "../1", "404", "0", "A"]) {
    expect((await postPng(app, parent)).status).toBe(422);
    expect(app.database.count()).toBe(3);
    expect(readdirSync(config.drawingsDir)).toHaveLength(3);
    expect(readdirSync(config.temporaryDir)).toHaveLength(0);
  }
  expect(app.database.find("2")?.parent).toBe(app.database.find("1")!.id);
  expect((await postPng(app, "")).headers.get("location")).toBe("/4");
  expect(app.database.find("4")?.parent).toBeNull();
  const missing = await (await app.fetch(new Request("https://scri.ch/absent"))).text();
  expect(missing).toContain("name=\"parent\" value=\"\"");
});

test("sharing metadata exposes a fetchable drawing PNG without JavaScript and omits hidden/error previews", async () => {
  const { app } = appWithData();
  const home = await (await app.fetch(new Request("https://untrusted.example/?background=ddd")))
    .text();
  expect(home).toContain("<meta property=\"og:url\" content=\"https://scri.ch/\">");
  expect(home).toContain("<meta name=\"twitter:card\" content=\"summary\">");
  expect(home).not.toContain("property=\"og:image\"");
  const saved = await postPng(app);
  const path = saved.headers.get("location")!;
  const page = await (await app.fetch(new Request(`https://untrusted.example${path}?anything=1`)))
    .text();
  const imageUrl = `https://scri.ch${path}.png`;
  expect(page).toContain(`<meta property="og:image" content="${imageUrl}">`);
  expect(page).toContain(`<meta name="twitter:image" content="${imageUrl}">`);
  expect(page).toContain("<meta name=\"twitter:card\" content=\"summary_large_image\">");
  expect(page).toContain(`<link rel="canonical" href="https://scri.ch${path}">`);
  expect(page).not.toContain("untrusted.example");
  const preview = await app.fetch(new Request(imageUrl));
  expect(preview.status).toBe(200);
  expect((await sharp(await preview.arrayBuffer()).metadata()).format).toBe("png");
  app.database.setVisibility(path.slice(1), "hidden");
  for (const hiddenPath of [path, "/missing"]) {
    const response = await app.fetch(new Request(`https://scri.ch${hiddenPath}`));
    expect(response.status).toBe(404);
    const body = await response.text();
    expect(body).not.toContain("property=\"og:");
    expect(body).not.toContain("name=\"twitter:");
    expect(body).not.toContain("rel=\"canonical\"");
  }
});
