import { isAbsolute, join, resolve } from "node:path";

export interface AppConfig {
  debug: boolean;
  maxExportPixels: number;
  host: string;
  port: number;
  publicOrigin: string;
  dataDir: string;
  drawingsDir: string;
  cacheDir: string;
  temporaryDir: string;
  databasePath: string;
  galleryCredentials: { username: string; password: string; } | null;
}

export interface ConfigEnvironment {
  NODE_ENV?: string;
  MAX_EXPORT_PIXELS?: string;
  HOST?: string;
  PORT?: string;
  PUBLIC_ORIGIN?: string;
  DATA_DIR?: string;
  GALLERY_USERNAME?: string;
  GALLERY_PASSWORD?: string;
}

export function loadConfig(environment: ConfigEnvironment = process.env): AppConfig {
  const production = environment.NODE_ENV === "production";
  const port = Number(environment.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("Invalid PORT");

  const maxExportPixels = Number(environment.MAX_EXPORT_PIXELS ?? 160_000_000);
  if (!Number.isSafeInteger(maxExportPixels) || maxExportPixels < 1) {
    throw new Error("MAX_EXPORT_PIXELS must be a positive safe integer");
  }

  const dataDir = resolve(environment.DATA_DIR ?? "/tmp/scrich-development");
  if (production && (!environment.DATA_DIR || !isAbsolute(environment.DATA_DIR))) {
    throw new Error("Production DATA_DIR must be an explicit absolute path");
  }

  const publicOrigin = environment.PUBLIC_ORIGIN ?? `http://localhost:${port}`;
  const origin = new URL(publicOrigin);
  if (origin.pathname !== "/" || origin.search || origin.hash) {
    throw new Error("PUBLIC_ORIGIN must contain only scheme, host, and optional port");
  }
  if (production && !environment.PUBLIC_ORIGIN) {
    throw new Error("Production PUBLIC_ORIGIN is required");
  }

  const username = environment.GALLERY_USERNAME;
  const password = environment.GALLERY_PASSWORD;
  if ((username && !password) || (!username && password)) {
    throw new Error("GALLERY_USERNAME and GALLERY_PASSWORD must be configured together");
  }

  return {
    debug: !production,
    maxExportPixels,
    host: environment.HOST ?? "127.0.0.1",
    port,
    publicOrigin: origin.origin,
    dataDir,
    drawingsDir: join(dataDir, "drawings"),
    cacheDir: join(dataDir, "cache", "v3"),
    temporaryDir: join(dataDir, "tmp"),
    databasePath: join(dataDir, "scrich.sqlite"),
    galleryCredentials: username && password ? { username, password } : null,
  };
}
