export interface DrawingSize {
  width?: number;
  height?: number;
}

export interface DrawingSettings {
  background?: string;
  foreground?: string;
  margin?: number;
  size?: DrawingSize;
}

const COLOR = /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i;
export const MAX_DIMENSION = 32_768;
export const MAX_PIXELS = 32_000_000;

function color(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.startsWith("#") ? value : `#${value}`;
  return COLOR.test(normalized) ? normalized.toLowerCase() : undefined;
}

function positiveInteger(value: unknown): number | undefined {
  return Number.isInteger(value) && Number(value) > 0 && Number(value) <= MAX_DIMENSION
    ? Number(value)
    : undefined;
}

export function normalizeSettings(value: unknown): DrawingSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const input = value as Record<string, unknown>;
  const settings: DrawingSettings = {};
  const background = color(input.background);
  const foreground = color(input.foreground);
  if (background) settings.background = background;
  if (foreground) settings.foreground = foreground;

  const margin = positiveInteger(input.margin);
  if (margin) settings.margin = margin;

  if (input.size && typeof input.size === "object" && !Array.isArray(input.size)) {
    const rawSize = input.size as Record<string, unknown>;
    const width = positiveInteger(rawSize.width);
    const height = positiveInteger(rawSize.height);
    if (width || height) {
      const size: DrawingSize = {};
      if (width) size.width = width;
      if (height) size.height = height;
      if (!width || !height || width * height <= MAX_PIXELS) settings.size = size;
    }
  }
  return settings;
}

export function settingsFromQuery(searchParams: URLSearchParams): DrawingSettings {
  const input: Record<string, unknown> = {};
  for (const key of ["background", "foreground", "margin"] as const) {
    const value = searchParams.get(key);
    if (value !== null) input[key] = key === "margin" ? Number(value) : value;
  }
  const size = searchParams.get("size");
  if (size !== null) {
    const match = /^(\d+)?(?:x(\d+)?)?$/.exec(size);
    if (match) {
      const width = match[1] ? Number(match[1]) : undefined;
      const height = match[2] ? Number(match[2]) : match[0].includes("x") ? undefined : width;
      input.size = { width, height };
    }
  }
  return normalizeSettings(input);
}

export function settingsFromForm(value: FormDataEntryValue | null): DrawingSettings {
  if (typeof value !== "string") return {};
  try {
    return normalizeSettings(JSON.parse(value));
  } catch {
    throw new Error("Invalid drawing settings");
  }
}

export function canonicalSettings(value: DrawingSettings): string {
  return JSON.stringify(value);
}
