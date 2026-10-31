// Response helpers shared by the YouCam routes.

import type { CachedResult } from "./cache";
import type { Feature } from "./features";

/** Result URLs expire in ~2 h and come from S3 without CORS: serve them through our proxy. */
export function proxiedUrl(remote: string): string {
  return `/api/youcam/image?url=${encodeURIComponent(remote)}`;
}

export function cachedResponse(feature: Feature, key: string, cached: CachedResult) {
  return {
    status: "success" as const,
    feature,
    key,
    cached: true,
    results: cached.results,
    imageUrl: cached.hasImage ? `/api/youcam/image?cached=${key}` : null,
  };
}
