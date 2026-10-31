import { createHmac, timingSafeEqual } from "node:crypto";
import { HttpError, readBytes } from "../http";
import { imageType } from "../image-format";
import { isYouCamResultUrl } from "./client";

function signature(url: string): string {
  const key = process.env.YOUCAM_API_KEY?.trim();
  if (!key) throw new HttpError("missing_api_key", 503);
  return createHmac("sha256", key).update(`clara-result:${url}`).digest("hex");
}

/** Only task results issued by this server can be fetched through the image proxy. */
export function signedResultUrl(url: string): string {
  if (!isYouCamResultUrl(url)) throw new HttpError("forbidden_host", 400);
  return `/api/youcam/image?${new URLSearchParams({ url, signature: signature(url) })}`;
}

export function verifyResultUrl(url: string, signed: string): boolean {
  if (!isYouCamResultUrl(url) || !/^[a-f0-9]{64}$/.test(signed)) return false;
  return timingSafeEqual(Buffer.from(signature(url), "hex"), Buffer.from(signed, "hex"));
}

export async function fetchResultImage(url: string) {
  if (!isYouCamResultUrl(url)) throw new HttpError("forbidden_host", 400);
  // Never follow a redirect from an allowed host to an arbitrary/internal address.
  const res = await fetch(url, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15_000) });
  if ([403, 404, 410].includes(res.status)) throw new HttpError("expired", 410);
  if (!res.ok) throw new HttpError("image_unavailable", 502);
  const bytes = await readBytes(res, 20 * 1024 * 1024);
  const type = imageType(bytes);
  if (!type) throw new HttpError("invalid_image", 502);
  return { bytes, type };
}
