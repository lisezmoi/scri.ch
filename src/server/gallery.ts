import type { DrawingDatabase } from "./database";
import { type PageConfig, renderFailure, renderGallery } from "./html";
import { requirePagePassword } from "./private";
import { html } from "./responses";

export function galleryResponse(
  request: Request,
  config: PageConfig,
  database: DrawingDatabase,
): Response {
  const url = new URL(request.url);
  const denied = requirePagePassword(request, config, "gallery");
  if (denied) return denied;
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
