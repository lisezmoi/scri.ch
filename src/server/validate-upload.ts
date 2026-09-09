import sharp from "sharp";
import { MAX_DIMENSION, MAX_PIXELS } from "../settings";

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
export const MAX_UPLOAD_BODY_BYTES = 11 * 1024 * 1024;

export class UploadError extends Error {
  constructor(readonly code: "invalid" | "too_large" | "timeout") {
    super(code);
  }
}

export function decodeBase64Png(value: FormDataEntryValue | null): Uint8Array<ArrayBuffer> {
  if (typeof value !== "string" || value.length === 0 || value.length % 4 !== 0) {
    throw new UploadError("invalid");
  }
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new UploadError("invalid");
  }
  const bytes = Buffer.from(value, "base64");
  if (bytes.byteLength > MAX_UPLOAD_BYTES) throw new UploadError("too_large");
  return new Uint8Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}

export async function validatePng(bytes: Uint8Array<ArrayBuffer>): Promise<void> {
  try {
    const image = sharp(bytes, { failOn: "error", limitInputPixels: MAX_PIXELS });
    const metadata = await image.metadata();
    if (metadata.format !== "png" || !metadata.width || !metadata.height) {
      throw new UploadError("invalid");
    }
    if (
      metadata.width > MAX_DIMENSION || metadata.height > MAX_DIMENSION
      || metadata.width * metadata.height > MAX_PIXELS
    ) {
      throw new UploadError("too_large");
    }
    // A complete output pipeline reliably propagates decoder errors under concurrency.
    // sharp().stats() can lose libspng read errors when several images are decoded at once.
    await image.png().toBuffer();
  } catch (error) {
    if (error instanceof UploadError) throw error;
    throw new UploadError("invalid");
  }
}

export async function readFormData(request: Request): Promise<FormData> {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_UPLOAD_BODY_BYTES) {
    throw new UploadError("too_large");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new UploadError("invalid");
  const body = new Uint8Array(MAX_UPLOAD_BODY_BYTES);
  let length = 0;
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    void reader.cancel().catch(() => {});
  }, 30_000);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (length + value.length > MAX_UPLOAD_BODY_BYTES) {
        void reader.cancel().catch(() => {});
        throw new UploadError("too_large");
      }
      body.set(value, length);
      length += value.length;
    }
    if (timedOut) throw new UploadError("timeout");
    try {
      return await new Response(body.subarray(0, length), { headers: request.headers }).formData();
    } catch {
      throw new UploadError("invalid");
    }
  } finally {
    clearTimeout(timeout);
    reader.releaseLock();
  }
}
