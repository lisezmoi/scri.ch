import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import type { DrawingDatabase } from "./database";
import { type PageConfig, renderFailure, renderNotFound } from "./html";
import { ImageLimitError, type ImageService } from "./images";
import { html } from "./responses";

export async function drawingImage(
  request: Request,
  shortId: string,
  variant: string | undefined,
  config: PageConfig,
  database: DrawingDatabase,
  images: ImageService,
): Promise<Response> {
  const drawing = database.find(shortId);
  if (drawing?.visibility !== "visible" || !existsSync(images.original(shortId))) {
    return html(renderNotFound(config), 404);
  }
  const rawMode = variant;
  const mode = rawMode === "raw" || rawMode === "cropped"
    ? rawMode
    : rawMode
    ? Number(rawMode[0]) as 2 | 3 | 4
    : "default";
  try {
    const imagePath = await images.resolve(drawing, mode);
    const bytes = await Bun.file(imagePath).arrayBuffer();
    if (database.find(shortId)?.visibility !== "visible") {
      return html(renderNotFound(config), 404);
    }
    const etag = `"${createHash("sha256").update(new Uint8Array(bytes)).digest("hex")}"`;
    const headers = {
      "content-type": "image/png",
      "x-content-type-options": "nosniff",
      "cache-control": "public, max-age=300, must-revalidate",
      etag,
    };
    const matches = request.headers.get("if-none-match")?.split(",").some((value) =>
      value.trim() === "*" || value.trim().replace(/^W\//, "") === etag
    );
    return new Response(matches ? null : bytes, { status: matches ? 304 : 200, headers });
  } catch (error) {
    if (database.find(shortId)?.visibility !== "visible") {
      return html(renderNotFound(config), 404);
    }
    if (error instanceof ImageLimitError) {
      return html(renderFailure(config, 403, error.message), 403);
    }
    throw error;
  }
}
