export const RESERVED_IDS = new Set([
  "404",
  "about",
  "admin",
  "assets",
  "drawings",
  "feed",
  "gallery",
  "index",
  "lib",
  "live",
  "plugins",
  "stats",
  "tmp",
]);

export function encodeShortId(value: number): string {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error("Short ID value must be a positive safe integer");
  }
  return value.toString(36);
}

export function decodeShortId(value: string): number {
  if (!/^[0-9a-z]+$/.test(value)) {
    throw new Error(`Invalid short ID: ${value}`);
  }
  const decoded = Number.parseInt(value, 36);
  if (!Number.isSafeInteger(decoded) || encodeShortId(decoded) !== value) {
    throw new Error(`Invalid short ID: ${value}`);
  }
  return decoded;
}
