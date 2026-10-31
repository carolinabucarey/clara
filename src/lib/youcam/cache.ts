// Dev-only disk cache for YouCam results, keyed by the exact inputs. It lets us
// iterate on the UI with the same test photos without spending API units.
// Disabled in production: Clara does not store user photos or results.

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const DIR = join(process.cwd(), ".cache", "youcam");

export function cacheEnabled(): boolean {
  return process.env.NODE_ENV === "development" || process.env.YOUCAM_CACHE === "1";
}

export function cacheKey(feature: string, inputs: Uint8Array[], params: unknown): string {
  const h = createHash("sha256");
  h.update(feature);
  for (const b of inputs) h.update(b);
  h.update(JSON.stringify(params ?? {}));
  return h.digest("hex").slice(0, 40);
}

const safe = (key: string) => /^[a-f0-9]{40}$/.test(key);

export interface CachedResult {
  results: Record<string, unknown>;
  hasImage: boolean;
}

export async function readCache(key: string): Promise<CachedResult | null> {
  if (!cacheEnabled() || !safe(key)) return null;
  try {
    return JSON.parse(await readFile(join(DIR, `${key}.json`), "utf8")) as CachedResult;
  } catch {
    return null;
  }
}

export async function readCachedImage(key: string): Promise<Uint8Array | null> {
  if (!cacheEnabled() || !safe(key)) return null;
  try {
    return new Uint8Array(await readFile(join(DIR, `${key}.img`)));
  } catch {
    return null;
  }
}

export async function writeCache(key: string, results: Record<string, unknown>, image?: Uint8Array | null) {
  if (!cacheEnabled() || !safe(key)) return;
  await mkdir(DIR, { recursive: true });
  if (image) await writeFile(join(DIR, `${key}.img`), image);
  const entry: CachedResult = { results, hasImage: !!image };
  await writeFile(join(DIR, `${key}.json`), JSON.stringify(entry, null, 2));
}
