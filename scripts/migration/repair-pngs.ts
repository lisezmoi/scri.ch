import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { type Browser, chromium } from "playwright";
import sharp from "sharp";
import { MAX_DIMENSION, MAX_PIXELS } from "../../src/settings";

interface RepairOptions {
  mediaDir: string;
  outputDir: string;
  ids?: string[];
}
interface RepairRecord {
  id: string;
  sourceSha256: string;
  sourceBytes: number;
  status: "valid" | "repaired" | "unrecoverable";
  reason?: string;
  outputSha256?: string;
  width?: number;
  height?: number;
}
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

// This is an offline migration tool, never an upload-validation fallback.
export async function repairPngs(options: RepairOptions) {
  const names = options.ids
    ? options.ids.map((id) => {
      if (!/^[0-9a-z]+$/.test(id)) throw new Error(`Invalid drawing ID: ${id}`);
      return `${id}.png`;
    })
    : readdirSync(options.mediaDir).filter((name) => /^[0-9a-z]+\.png$/.test(name)).sort();
  if (new Set(names).size !== names.length) throw new Error("Repeated drawing ID");
  // Refuse an existing output directory, including the source directory.
  mkdirSync(options.outputDir, { mode: 0o700 });
  mkdirSync(join(options.outputDir, "drawings"));
  const counts = { valid: 0, repaired: 0, unrecoverable: 0 };
  const manifest = join(options.outputDir, "manifest.jsonl");
  writeFileSync(manifest, "");
  let browser: Browser | undefined;
  try {
    for (const name of names) {
      const source = join(options.mediaDir, name);
      const bytes = readFileSync(source);
      const record: RepairRecord = {
        id: name.slice(0, -4),
        sourceSha256: hash(bytes),
        sourceBytes: bytes.length,
        status: "valid",
      };
      let needsRepair = false;
      try {
        await sharp(bytes, { failOn: "error", limitInputPixels: MAX_PIXELS }).png().toBuffer();
      } catch {
        needsRepair = true;
      }
      if (needsRepair) {
        let eligible = true;
        try {
          const metadata = await sharp(bytes, { failOn: "none", limitInputPixels: MAX_PIXELS })
            .metadata();
          if (
            metadata.format !== "png" || !metadata.width || !metadata.height
            || metadata.width > MAX_DIMENSION || metadata.height > MAX_DIMENSION
            || metadata.width * metadata.height > MAX_PIXELS || (metadata.pages ?? 1) > 1
          ) throw new Error("Not a supported static PNG within the migration limits");
        } catch (error) {
          eligible = false;
          record.status = "unrecoverable";
          record.reason = String(error);
        }
        if (eligible) {
          // Browser installation/startup failures abort rather than mislabeling files.
          browser ??= await chromium.launch({ headless: true });
          const page = await browser.newPage();
          await page.route("**/*", (route) => route.abort());
          try {
            const result = await page.evaluate(async (data) => {
              const load = async (url: string) => {
                const image = new Image();
                image.src = url;
                let timer: ReturnType<typeof setTimeout> | undefined;
                try {
                  await Promise.race([
                    image.decode(),
                    new Promise<never>((_, reject) => {
                      timer = setTimeout(() => reject(new Error("Image decode timeout")), 10_000);
                    }),
                  ]);
                } finally {
                  clearTimeout(timer);
                }
                return image;
              };
              const image = await load(data);
              const canvas = document.createElement("canvas");
              canvas.width = image.naturalWidth;
              canvas.height = image.naturalHeight;
              const context = canvas.getContext("2d")!;
              context.drawImage(image, 0, 0);
              const original = context.getImageData(0, 0, canvas.width, canvas.height).data;
              const png = canvas.toDataURL("image/png");
              const repaired = await load(png);
              context.clearRect(0, 0, canvas.width, canvas.height);
              context.drawImage(repaired, 0, 0);
              const roundtrip = context.getImageData(0, 0, canvas.width, canvas.height).data;
              if (!original.every((value, i) => value === roundtrip[i])) {
                throw new Error("Browser pixel roundtrip changed the drawing");
              }
              return { png, width: canvas.width, height: canvas.height };
            }, `data:image/png;base64,${bytes.toString("base64")}`);
            const repaired = Buffer.from(result.png.split(",")[1]!, "base64");
            const decoded = await sharp(repaired, { failOn: "error", limitInputPixels: MAX_PIXELS })
              .raw().toBuffer({ resolveWithObject: true });
            if (decoded.info.width !== result.width || decoded.info.height !== result.height) {
              throw new Error("Repaired dimensions changed");
            }
            record.status = "repaired";
            record.width = result.width;
            record.height = result.height;
            record.outputSha256 = hash(repaired);
            record.reason =
              "Re-encoded browser-visible pixels; missing content cannot be restored.";
            writeFileSync(join(options.outputDir, "drawings", name), repaired, { flag: "wx" });
          } catch (error) {
            record.status = "unrecoverable";
            record.reason = String(error);
          } finally {
            await page.close();
          }
        }
      }
      if (hash(readFileSync(source)) !== record.sourceSha256) {
        throw new Error(`Source changed during repair: ${name}`);
      }
      counts[record.status]++;
      appendFileSync(manifest, JSON.stringify(record) + "\n");
    }
    const report = {
      version: 1,
      method:
        "Chromium canvas PNG re-encoding; exact browser pixel roundtrip and strict Sharp validation",
      browserVersion: browser?.version() ?? null,
      sourceDirectory: resolve(options.mediaDir),
      counts,
      originalsModified: false,
      limitation:
        "Preserves what Chromium displays, not necessarily the complete original drawing. Review repaired images before migration.",
    };
    writeFileSync(join(options.outputDir, "report.json"), JSON.stringify(report, null, 2) + "\n");
    return report;
  } finally {
    await browser?.close();
  }
}

if (import.meta.main) {
  try {
    const args = new Map<string, string>();
    for (let i = 2; i < process.argv.length; i += 2) {
      const key = process.argv[i]!;
      const value = process.argv[i + 1];
      if (!["--media-dir", "--output-dir", "--ids"].includes(key) || !value || args.has(key)) {
        throw new Error("Usage: --media-dir PATH --output-dir NEW_PATH [--ids 5s6,d4q]");
      }
      args.set(key, value);
    }
    if (!args.has("--media-dir") || !args.has("--output-dir")) {
      throw new Error("--media-dir and --output-dir are required");
    }
    console.log(JSON.stringify(
      await repairPngs({
        mediaDir: resolve(args.get("--media-dir")!),
        outputDir: resolve(args.get("--output-dir")!),
        ...(args.has("--ids") ? { ids: args.get("--ids")!.split(",") } : {}),
      }),
      null,
      2,
    ));
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
