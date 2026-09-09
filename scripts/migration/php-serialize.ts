import type { DrawingSettings, DrawingSize } from "../../src/settings";

class Parser {
  readonly #source: Buffer;
  #offset = 0;

  constructor(source: string) {
    this.#source = Buffer.from(source, "utf8");
  }

  parse(): unknown {
    const value = this.#value();
    if (this.#offset !== this.#source.length) throw new Error("Trailing PHP serialized data");
    return value;
  }

  #expect(value: string): void {
    const bytes = Buffer.from(value);
    if (!this.#source.subarray(this.#offset, this.#offset + bytes.length).equals(bytes)) {
      throw new Error(`Malformed PHP serialized data at byte ${this.#offset}`);
    }
    this.#offset += bytes.length;
  }

  #integer(terminator: string): number {
    const end = this.#source.indexOf(terminator, this.#offset);
    if (end < 0) throw new Error("Unterminated PHP integer");
    const result = Number(this.#source.subarray(this.#offset, end).toString("ascii"));
    if (!Number.isSafeInteger(result)) throw new Error("Invalid PHP integer");
    this.#offset = end + terminator.length;
    return result;
  }

  #value(): unknown {
    const type = String.fromCharCode(this.#source[this.#offset++] ?? 0);
    if (type === "N") {
      this.#expect(";");
      return null;
    }
    if (type === "i") {
      this.#expect(":");
      return this.#integer(";");
    }
    if (type === "b") {
      this.#expect(":");
      return this.#integer(";") === 1;
    }
    if (type === "s") {
      this.#expect(":");
      const length = this.#integer(":");
      this.#expect("\"");
      const value = this.#source.subarray(this.#offset, this.#offset + length).toString("utf8");
      this.#offset += length;
      this.#expect("\";");
      return value;
    }
    if (type === "a") {
      this.#expect(":");
      const length = this.#integer(":");
      this.#expect("{");
      const entries: [unknown, unknown][] = [];
      for (let index = 0; index < length; index++) entries.push([this.#value(), this.#value()]);
      this.#expect("}");
      if (entries.every(([key]) => typeof key === "string")) {
        return Object.fromEntries(entries as [string, unknown][]);
      }
      return entries.map(([, value]) => value);
    }
    throw new Error(`Unsupported PHP serialized type: ${type}`);
  }
}

function legacyColor(value: unknown): string | undefined {
  return typeof value === "string" && /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(value)
    ? value.toLowerCase()
    : undefined;
}

function legacyInteger(value: unknown): number | undefined {
  return Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : undefined;
}

export function parseLegacySettings(serialized: string | null): DrawingSettings {
  if (serialized === null) return {};
  const parsed = new Parser(serialized).parse();
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Legacy settings must be an associative array");
  }
  const input = parsed as Record<string, unknown>;
  const settings: DrawingSettings = {};
  const background = legacyColor(input.background);
  const foreground = legacyColor(input.foreground);
  const margin = legacyInteger(input.margin);
  if (background) settings.background = background;
  if (foreground) settings.foreground = foreground;
  if (margin) settings.margin = margin;
  if (input.size && typeof input.size === "object" && !Array.isArray(input.size)) {
    const inputSize = input.size as Record<string, unknown>;
    const width = legacyInteger(inputSize.width);
    const height = legacyInteger(inputSize.height);
    if (width || height) {
      const size: DrawingSize = {};
      if (width) size.width = width;
      if (height) size.height = height;
      settings.size = size;
    }
  }
  return settings;
}
