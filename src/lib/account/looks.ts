"use client";

// Saved looks: the pieces with their verdicts, the outfit and portrait images
// copied to the person's folder (YouCam's own links expire within hours).

import type { Trial } from "@/components/ClaraApp";
import { removeImages, SaveError, signedInClient, uploadImage } from "./storage";
import type {
  GarmentAttributes,
  GarmentColor,
  MakeupStep,
  OutfitResult,
  Slot,
  VerdictDraft,
  VerdictResult,
} from "../types";

export interface SavedPiece {
  slot: Slot;
  attrs: GarmentAttributes;
  color: GarmentColor;
  result: VerdictResult | null;
  draft: VerdictDraft | null;
  draftLocale: string | null;
  garmentPath: string;
  tryOnPath: string | null;
}

export interface SavedHairstyle {
  templateId: string;
  title: string;
  code?: string;
  params?: Record<string, string | number>;
}

export interface SavedLook {
  id: string;
  createdAt: string;
  pieces: SavedPiece[];
  outfit: OutfitResult | null;
  outfitPath: string | null;
  facePath: string | null;
  makeup: MakeupStep[] | null;
  hairstyle: SavedHairstyle | null;
}

export interface LookToSave {
  pieces: Array<{ slot: Slot; trial: Trial }>;
  outfitUrl: string | null;
  outfit: OutfitResult | null;
  faceUrl: string | null;
  makeup: MakeupStep[] | null;
  hairstyle: SavedHairstyle | null;
}

export async function saveLook(input: LookToSave): Promise<string> {
  const { sb, uid } = await signedInClient();
  const id = crypto.randomUUID();
  const base = `${uid}/looks/${id}`;
  const uploaded: string[] = [];
  const bySource = new Map<string | Blob, string>();
  /** Uploads the first source that can still be read; the same image is stored once. */
  const upload = async (name: string, ...sources: Array<string | Blob | null | undefined>) => {
    let last: unknown = null;
    for (const src of sources) {
      if (!src) continue;
      const done = bySource.get(src);
      if (done) return done;
      try {
        const path = await uploadImage(`${base}/${name}`, src);
        uploaded.push(path);
        bySource.set(src, path);
        return path;
      } catch (e) {
        last = e;
      }
    }
    if (last) throw last;
    return null;
  };

  try {
    const outfitPath = await upload("outfit", input.outfitUrl);
    const pieces: SavedPiece[] = [];
    for (const [i, { slot, trial }] of input.pieces.entries()) {
      const g = trial.garment;
      pieces.push({
        slot,
        attrs: g.attrs,
        color: g.color,
        result: trial.result ?? null,
        draft: trial.draft ?? null,
        draftLocale: trial.draftLocale ?? null,
        garmentPath: (await upload(`piece-${i}`, g.isolatedUrl, g.upload))!,
        tryOnPath: await upload(`piece-${i}-on`, trial.tryOnUrl).catch(() => null),
      });
    }
    const facePath = await upload("face", input.faceUrl);
    const { error } = await sb.from("looks").insert({
      id,
      user_id: uid,
      pieces,
      outfit_verdict: input.outfit,
      outfit_path: outfitPath,
      face_path: facePath,
      makeup: input.makeup,
      hairstyle: input.hairstyle,
    });
    if (error) throw new SaveError("generic");
    return id;
  } catch (e) {
    await removeImages(uploaded).catch(() => undefined);
    throw e instanceof SaveError ? e : new SaveError("generic");
  }
}

interface LookRow {
  id: string;
  created_at: string;
  pieces: SavedPiece[];
  outfit_verdict: OutfitResult | null;
  outfit_path: string | null;
  face_path: string | null;
  makeup: MakeupStep[] | null;
  hairstyle: SavedHairstyle | null;
}

export async function listLooks(): Promise<SavedLook[]> {
  const { sb, uid } = await signedInClient();
  const { data, error } = await sb.from("looks").select("*").eq("user_id", uid).order("created_at", { ascending: false });
  if (error) throw new SaveError("generic");
  return (data as LookRow[]).map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    pieces: r.pieces ?? [],
    outfit: r.outfit_verdict,
    outfitPath: r.outfit_path,
    facePath: r.face_path,
    makeup: r.makeup,
    hairstyle: r.hairstyle,
  }));
}

export function lookImagePaths(look: SavedLook): string[] {
  return [look.outfitPath, look.facePath, ...look.pieces.flatMap((p) => [p.garmentPath, p.tryOnPath])].filter(
    (p): p is string => !!p,
  );
}

export async function deleteLook(look: SavedLook) {
  const { sb, uid } = await signedInClient();
  await removeImages([...new Set(lookImagePaths(look))]);
  const { error } = await sb.from("looks").delete().eq("id", look.id).eq("user_id", uid);
  if (error) throw new SaveError("generic");
}
