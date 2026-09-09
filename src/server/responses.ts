import { existsSync } from "node:fs";

export function html(body: string, status = 200, extraHeaders: HeadersInit = {}): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders,
    },
  });
}

export function fileResponse(path: string, cache = true): Response | null {
  const file = Bun.file(path);
  if (!existsSync(path)) return null;
  return new Response(file, {
    headers: {
      "x-content-type-options": "nosniff",
      "cache-control": cache ? "public, max-age=31536000, immutable" : "no-store",
    },
  });
}
