import { mkdirSync, renameSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import type { ClientManifest } from "../src/server/assets";

export const projectRoot = resolve(import.meta.dir, "..");

export async function build(outputDir = join(projectRoot, "dist"), development = false) {
  mkdirSync(outputDir, { recursive: true });
  const manifest = {} as ClientManifest;
  for (const entry of ["scrich.ts", "stats.ts", "scrich.css", "admin.css"] as const) {
    const result = await Bun.build({
      entrypoints: [join(projectRoot, "src/client", entry)],
      target: "browser",
      format: "esm",
      minify: !development,
      naming: "[name]-[hash].[ext]",
    });
    if (!result.success || !result.outputs[0]) {
      throw new AggregateError(result.logs, `Failed to build ${entry}`);
    }
    const output = result.outputs[0];
    const filename = basename(output.path);
    await Bun.write(join(outputDir, filename), output);
    manifest[entry === "scrich.ts" ? "scrich.js" : entry === "stats.ts" ? "stats.js" : entry] =
      `/assets/${filename}`;
  }
  const temporary = join(outputDir, "manifest.json.tmp");
  await Bun.write(temporary, JSON.stringify(manifest, null, 2) + "\n");
  renameSync(temporary, join(outputDir, "manifest.json"));
  return manifest;
}

if (import.meta.main) await build();
