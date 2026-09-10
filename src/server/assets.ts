import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export type ClientManifest = Record<"scrich.js" | "stats.js" | "scrich.css" | "admin.css", string>;
export const DIST_DIR = resolve(import.meta.dir, "../../dist");

export function loadAssets(directory = DIST_DIR) {
  try {
    const manifest: ClientManifest = JSON.parse(
      readFileSync(join(directory, "manifest.json"), "utf8"),
    );
    for (const name of ["scrich.js", "stats.js", "scrich.css", "admin.css"] as const) {
      const url = manifest[name];
      const extension = name.split(".")[1];
      if (
        typeof url !== "string"
        || !new RegExp(`^/assets/[a-z]+-[a-zA-Z0-9_-]+\\.${extension}$`).test(url)
        || !existsSync(join(directory, url.slice("/assets/".length)))
      ) {
        throw new Error(`Missing or invalid asset: ${name}`);
      }
    }
    return manifest;
  } catch (cause) {
    throw new Error(
      "Client assets are missing or invalid. Run bun run build before starting the server.",
      { cause },
    );
  }
}
