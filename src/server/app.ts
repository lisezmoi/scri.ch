import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { settingsFromQuery } from "../settings";
import { DIST_DIR, loadAssets } from "./assets";
import type { AppConfig } from "./config";
import { DrawingDatabase } from "./database";
import { drawingImage } from "./drawings";
import { galleryResponse } from "./gallery";
import { renderDrawingPage, renderFailure, renderNotFound } from "./html";
import { ImageService } from "./images";
import { fileResponse, html } from "./responses";
import { createStatsResponse } from "./stats";
import { saveDrawing } from "./uploads";

const PROJECT_ROOT = resolve(import.meta.dir, "../..");
const ASSETS_DIR = join(PROJECT_ROOT, "assets");
const IMAGE_PATTERN = /^\/([0-9a-z]+)(?:-(raw|cropped|[234]x))?\.png$/;

export interface ScrichApp {
  database: DrawingDatabase;
  fetch(request: Request): Promise<Response>;
  close(): void;
}

export function createApp(config: AppConfig, assetDirectory = DIST_DIR): ScrichApp {
  // Validate the build before creating any application data or accepting requests.
  const clientAssets = loadAssets(assetDirectory);
  for (const directory of [config.dataDir, config.drawingsDir, config.cacheDir]) {
    mkdirSync(directory, { recursive: true });
  }
  mkdirSync(config.temporaryDir, { recursive: true, mode: 0o700 });
  const database = new DrawingDatabase(config.databasePath);
  const images = new ImageService(config);
  const statsResponse = createStatsResponse(database);

  async function fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    let pageConfig = { ...config, clientAssets };
    try {
      if (config.debug) pageConfig = { ...config, clientAssets: loadAssets(assetDirectory) };
      if (request.method === "POST" && path === "/") {
        return await saveDrawing(request, pageConfig, database, images);
      }
      if (request.method !== "GET") return html(renderNotFound(pageConfig), 404);
      if (path === "/") {
        return html(renderDrawingPage(pageConfig, settingsFromQuery(url.searchParams)));
      }
      if (path === "/stats" || path === "/stats/" || path === "/stats.php") {
        return statsResponse(request, pageConfig);
      }
      if (path === "/gallery" || path === "/gallery/") {
        return galleryResponse(request, pageConfig, database);
      }
      if (path === "/about") {
        return fileResponse(join(PROJECT_ROOT, "about/index.html"), false)
          ?? html(renderNotFound(pageConfig), 404);
      }
      if (path === "/favicon.png") {
        return fileResponse(join(ASSETS_DIR, "favicon.png"))
          ?? html(renderNotFound(pageConfig), 404);
      }
      if (Object.values(pageConfig.clientAssets).includes(path)) {
        return fileResponse(join(assetDirectory, path.slice("/assets/".length)), !config.debug)
          ?? html(renderNotFound(pageConfig), 404);
      }
      if (/^\/assets\/[0-9A-Za-z._-]+$/.test(path)) {
        return fileResponse(join(ASSETS_DIR, path.slice("/assets/".length)))
          ?? html(renderNotFound(pageConfig), 404);
      }
      const imageMatch = IMAGE_PATTERN.exec(path);
      if (imageMatch) {
        const shortId = imageMatch[1]!;
        if (shortId === "404") {
          return fileResponse(join(ASSETS_DIR, "404.png")) ?? html(renderNotFound(pageConfig), 404);
        }
        return await drawingImage(request, shortId, imageMatch[2], pageConfig, database, images);
      }
      const shortId = path.slice(1);
      if (/^[0-9a-z]+$/.test(shortId)) {
        const drawing = database.find(shortId);
        if (drawing?.visibility === "visible") {
          return html(renderDrawingPage(pageConfig, drawing.settings, drawing.shortId));
        }
      }
      return html(renderNotFound(pageConfig), 404);
    } catch (error) {
      console.error("Request failed", error);
      return html(renderFailure(pageConfig, 500, "Internal Server Error"), 500);
    }
  }
  return { database, fetch, close: () => database.close() };
}
