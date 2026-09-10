import { timingSafeEqual } from "node:crypto";
import { type PageConfig, renderFailure } from "./html";
import { html } from "./responses";

function authorized(request: Request, password: string): boolean {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Basic ")) return false;
  const supplied = Buffer.from(header.slice(6), "base64").toString("utf8");
  const separator = supplied.indexOf(":");
  if (separator < 0) return false;
  // Basic Auth includes a username, but these pages only require a password.
  const expectedBuffer = Buffer.from(password);
  const suppliedBuffer = Buffer.from(supplied.slice(separator + 1));
  return expectedBuffer.length === suppliedBuffer.length
    && timingSafeEqual(expectedBuffer, suppliedBuffer);
}

export function requirePagePassword(
  request: Request,
  config: PageConfig,
  page: "gallery" | "stats",
): Response | null {
  const password = config[`${page}Password`];
  if (!password || authorized(request, password)) return null;
  return html(renderFailure(config, 401, "Authentication required"), 401, {
    "www-authenticate": `Basic realm="scri.ch ${page}", charset="UTF-8"`,
  });
}
