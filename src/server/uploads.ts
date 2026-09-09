import { existsSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { decodeShortId, RESERVED_IDS } from "../id";
import { settingsFromForm } from "../settings";
import { type DrawingDatabase, InvalidParentError } from "./database";
import { type PageConfig, renderFailure } from "./html";
import type { ImageService } from "./images";
import { html } from "./responses";
import { decodeBase64Png, readFormData, UploadError, validatePng } from "./validate-upload";

export async function saveDrawing(
  request: Request,
  config: PageConfig,
  database: DrawingDatabase,
  images: ImageService,
): Promise<Response> {
  let temporary: string | undefined;
  let destination: string | undefined;
  try {
    const form = await readFormData(request);
    const bytes = decodeBase64Png(form.get("new_drawing"));
    await validatePng(bytes);
    const parent = form.get("parent");
    if (parent !== null && parent !== "") {
      try {
        if (typeof parent !== "string" || RESERVED_IDS.has(parent)) throw new Error();
        decodeShortId(parent);
      } catch {
        throw new UploadError("invalid");
      }
    }
    let settings;
    try {
      settings = settingsFromForm(form.get("settings"));
    } catch {
      throw new UploadError("invalid");
    }
    temporary = join(config.temporaryDir, `${crypto.randomUUID()}.png`);
    writeFileSync(temporary, bytes, { flag: "wx" });
    const drawing = database.create(
      settings,
      new Date().toISOString(),
      (shortId) => existsSync(images.original(shortId)),
      (shortId) => {
        destination = images.original(shortId);
        renameSync(temporary!, destination);
        temporary = undefined;
      },
      parent ? parent as string : null,
    );
    return new Response(null, { status: 303, headers: { location: `/${drawing.shortId}` } });
  } catch (error) {
    if (temporary && existsSync(temporary)) unlinkSync(temporary);
    if (destination && existsSync(destination)) unlinkSync(destination);
    const code = error instanceof InvalidParentError
      ? "invalid"
      : error instanceof UploadError
      ? error.code
      : "internal";
    const status = code === "too_large"
      ? 413
      : code === "timeout"
      ? 408
      : code === "invalid"
      ? 422
      : 500;
    if (code === "internal") console.error("Failed to save drawing", error);
    return html(
      renderFailure(
        config,
        status,
        code === "too_large" ? "Drawing is too large" : "Invalid drawing",
      ),
      status,
    );
  }
}
