"use client";

// Moving images between this session (object URLs, YouCam results behind our
// proxy) and the person's private folder in the bucket.

import { BUCKET, supabase } from "../supabase/client";

export class SaveError extends Error {
  constructor(public code: "expired" | "generic" | "disabled" | "signedOut") {
    super(code);
    this.name = "SaveError";
  }
}

export async function signedInClient() {
  const sb = supabase();
  if (!sb) throw new SaveError("disabled");
  const { data } = await sb.auth.getUser();
  if (!data.user) throw new SaveError("signedOut");
  return { sb, uid: data.user.id };
}

/** Reads an image from this page. YouCam results expire after a couple of hours (410 from the proxy). */
async function readImage(url: string | Blob): Promise<Blob> {
  if (url instanceof Blob) return url;
  const res = await fetch(url).catch(() => null);
  if (!res || !res.ok) throw new SaveError(res?.status === 410 || res?.status === 404 ? "expired" : "generic");
  return res.blob();
}

export async function uploadImage(path: string, source: string | Blob): Promise<string> {
  const sb = supabase();
  if (!sb) throw new SaveError("disabled");
  const blob = await readImage(source);
  const { error } = await sb.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: blob.type || "image/jpeg", upsert: true, cacheControl: "3600" });
  if (error) throw new SaveError("generic");
  return path;
}

export async function downloadImage(path: string): Promise<Blob> {
  const sb = supabase();
  if (!sb) throw new SaveError("disabled");
  const { data, error } = await sb.storage.from(BUCKET).download(path);
  if (error || !data) throw new SaveError("generic");
  return data;
}

/** Short-lived links to show stored images. */
export async function signedUrls(paths: string[]): Promise<Record<string, string>> {
  const sb = supabase();
  if (!sb || paths.length === 0) return {};
  const { data } = await sb.storage.from(BUCKET).createSignedUrls(paths, 3600);
  return Object.fromEntries((data ?? []).filter((d) => d.signedUrl && d.path).map((d) => [d.path!, d.signedUrl!]));
}

export async function removeImages(paths: string[]) {
  const sb = supabase();
  if (!sb || paths.length === 0) return;
  await sb.storage.from(BUCKET).remove(paths);
}
