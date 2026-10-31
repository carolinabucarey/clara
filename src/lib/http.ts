// Bounded request/response readers shared by the API routes.
import { imageType } from "./image-format";
export class HttpError extends Error {
  constructor(public code: string, public status: number) {
    super(code);
    this.name = "HttpError";
  }
}

export async function readBytes(message: Request | Response, limit: number): Promise<Uint8Array> {
  if (Number(message.headers.get("content-length")) > limit) {
    throw new HttpError("exceed_max_filesize", 413);
  }
  const reader = message.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new HttpError("exceed_max_filesize", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function readForm(req: Request, limit: number): Promise<FormData> {
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data;")) {
    throw new HttpError("invalid_request", 415);
  }
  const bytes = await readBytes(req, limit);
  try {
    return await new Response(bytes as BodyInit, { headers: req.headers }).formData();
  } catch {
    throw new HttpError("invalid_request", 400);
  }
}

export async function readJson(req: Request, limit = 64 * 1024): Promise<unknown> {
  const bytes = await readBytes(req, limit);
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new HttpError("invalid_request", 400);
  }
}

export async function readImageFile(form: FormData, name: string, maxBytes: number) {
  const value = form.get(name);
  if (!value || typeof value === "string") return null;
  if (value.size > maxBytes) throw new HttpError("exceed_max_filesize", 413);
  if (!value.size) throw new HttpError("invalid_image", 400);
  const bytes = new Uint8Array(await value.arrayBuffer());
  const type = imageType(bytes);
  // The browser converts uploads to JPEG; both vision providers also support PNG.
  if (!type || type === "image/webp" || type !== value.type) throw new HttpError("invalid_image", 415);
  return { bytes, type, name: `${name}.${type === "image/png" ? "png" : "jpg"}` };
}

/** Block cross-site browser submissions to the anonymous, paid API routes. */
export function requireSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (req.headers.get("sec-fetch-site") === "cross-site" || (origin && origin !== new URL(req.url).origin)) {
    throw new HttpError("forbidden_origin", 403);
  }
}

// Best-effort protection for the public demo. Each server instance has its own
// limits; a shared limiter is required before running a larger public launch.
const requests = new Map<string, { count: number; until: number }>();
export function rateLimit(req: Request, group: string, max = 30) {
  const now = Date.now();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  const key = `${group}:${ip}`;
  for (const [id, entry] of requests) if (entry.until <= now) requests.delete(id);
  let entry = requests.get(key);
  if (!entry) {
    if (requests.size >= 4096) throw new HttpError("rate_limited", 429);
    entry = { count: 0, until: now + 60_000 };
    requests.set(key, entry);
  }
  if (++entry.count > max) throw new HttpError("rate_limited", 429);
}
