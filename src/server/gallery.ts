import { timingSafeEqual } from "node:crypto";
import type { AppConfig } from "./config";
import type { DrawingDatabase } from "./database";
import { type PageConfig, renderFailure, renderGallery, renderNotFound } from "./html";
import { html } from "./responses";

function authorized(request: Request, config: AppConfig): boolean {
  const credentials = config.galleryCredentials;
  if (!credentials) return false;
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Basic ")) return false;
  let supplied: string;
  try {
    supplied = Buffer.from(header.slice(6), "base64").toString("utf8");
  } catch {
    return false;
  }
  const expectedBuffer = Buffer.from(`${credentials.username}:${credentials.password}`);
  const suppliedBuffer = Buffer.from(supplied);
  return expectedBuffer.length === suppliedBuffer.length
    && timingSafeEqual(expectedBuffer, suppliedBuffer);
}

export function galleryResponse(
  request: Request,
  config: PageConfig,
  database: DrawingDatabase,
): Response {
  const url = new URL(request.url);
  if (!config.galleryCredentials) return html(renderNotFound(config), 404);
  if (!authorized(request, config)) {
    return html(renderFailure(config, 401, "Authentication required"), 401, {
      "www-authenticate": "Basic realm=\"scri.ch gallery\", charset=\"UTF-8\"",
    });
  }
  const rawPage = url.searchParams.get("p") ?? "1";
  if (!/^[1-9][0-9]*$/.test(rawPage)) {
    return html(renderFailure(config, 400, "Invalid page"), 400);
  }
  const page = Number(rawPage);
  const total = database.count();
  const pageCount = Math.max(1, Math.ceil(total / 50));
  if (!Number.isSafeInteger(page) || page > pageCount) {
    return html(renderFailure(config, 400, "Invalid page"), 400);
  }
  return html(
    renderGallery(config, database.list((page - 1) * 50, 50), page, pageCount, total),
  );
}
