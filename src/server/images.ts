import { existsSync, renameSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { MAX_PIXELS } from "../settings";
import type { AppConfig } from "./config";
import type { DrawingRecord } from "./database";

export class ImageLimitError extends Error {}

export class ImageService {
  readonly #config: AppConfig;
  readonly #pending = new Map<string, Promise<string>>();
  #zoomQueue: Promise<void> = Promise.resolve();

  constructor(config: AppConfig) {
    this.#config = config;
  }

  original(shortId: string): string {
    return join(this.#config.drawingsDir, `${shortId}.png`);
  }

  async dimensions(drawing: DrawingRecord): Promise<{ width: number; height: number; }> {
    const path = await this.resolve(drawing, "default");
    const { width, height } = await sharp(path, { limitInputPixels: false }).metadata();
    if (!width || !height) throw new Error(`Missing image dimensions: ${drawing.shortId}`);
    return { width, height };
  }

  async resolve(
    drawing: DrawingRecord,
    mode: "raw" | "cropped" | "default" | 2 | 3 | 4,
  ): Promise<string> {
    const original = this.original(drawing.shortId);
    if (mode === "raw") return original;
    if (mode === "cropped") return await this.#cropped(drawing, 0);
    const base = drawing.settings.size
      ? await this.#flattened(drawing)
      : await this.#cropped(drawing);
    if (mode === "default") return base;
    return await this.#zoomed(drawing.shortId, base, mode);
  }

  async #flattened(drawing: DrawingRecord): Promise<string> {
    const destination = join(this.#config.cacheDir, `${drawing.shortId}-background.png`);
    return await this.#generate(destination, async (temporary) => {
      await sharp(this.original(drawing.shortId), { failOn: "error", limitInputPixels: MAX_PIXELS })
        .flatten({ background: drawing.settings.background ?? "#ffffff" })
        .png()
        .toFile(temporary);
    });
  }

  async #cropped(drawing: DrawingRecord, padding = 20): Promise<string> {
    const destination = join(
      this.#config.cacheDir,
      `${drawing.shortId}-${padding === 0 ? "cropped" : "crop"}.png`,
    );
    const background = drawing.settings.background ?? "#ffffff";
    return await this.#generate(destination, async (temporary) => {
      // Complete flattening before trimming: Sharp runs trim first within one pipeline.
      const flattened = await this.#flattened(drawing);
      const cropped = sharp(flattened, { failOn: "error", limitInputPixels: MAX_PIXELS })
        .trim({ background, threshold: 0, lineArt: true });
      if (padding) {
        cropped.extend({
          top: padding,
          bottom: padding,
          left: padding,
          right: padding,
          background,
        });
      }
      await cropped.png().toFile(temporary);
    });
  }

  async #zoomed(shortId: string, source: string, factor: 2 | 3 | 4): Promise<string> {
    const destination = join(this.#config.cacheDir, `${shortId}-${factor}x.png`);
    // Check the current limit even when the generated image is already cached.
    const metadata = await sharp(source, { failOn: "error", limitInputPixels: false }).metadata();
    if (
      !metadata.width || !metadata.height
      || metadata.width * metadata.height * factor * factor > this.#config.maxExportPixels
    ) {
      throw new ImageLimitError(
        `The requested zoom exceeds the ${this.#config.maxExportPixels} pixel export limit.`,
      );
    }
    return await this.#generate(destination, async (temporary) => {
      // Serialize zooms so concurrent requests cannot multiply the large resize buffers.
      const previous = this.#zoomQueue;
      let release!: () => void;
      this.#zoomQueue = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        await sharp(source, { failOn: "error", limitInputPixels: this.#config.maxExportPixels })
          .resize(metadata.width * factor, metadata.height * factor, {
            kernel: sharp.kernel.nearest,
          })
          .png()
          .toFile(temporary);
      } finally {
        release();
      }
    });
  }

  async #generate(
    destination: string,
    generate: (temporary: string) => Promise<void>,
  ): Promise<string> {
    if (existsSync(destination)) return destination;
    const active = this.#pending.get(destination);
    if (active) return await active;
    const promise = (async () => {
      const temporary = `${destination}.${crypto.randomUUID()}.tmp`;
      try {
        await generate(temporary);
        try {
          renameSync(temporary, destination);
        } catch (error) {
          if (!existsSync(destination)) throw error;
          unlinkSync(temporary);
        }
        return destination;
      } finally {
        if (existsSync(temporary)) unlinkSync(temporary);
      }
    })();
    this.#pending.set(destination, promise);
    try {
      return await promise;
    } finally {
      this.#pending.delete(destination);
    }
  }
}
