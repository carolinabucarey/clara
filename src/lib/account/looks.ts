"use client";

// Saved looks: the pieces with their verdicts, the outfit and portrait images
// copied to the person's folder (YouCam's own links expire within hours).

import type { Trial } from "@/components/ClaraApp";
import { canvasToBlob, loadImage, toCanvas } from "../image";
import { downloadImage, removeImages, SaveError, signedInClient, uploadImage } from "./storage";
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
  /** The same piece recolored to the person's palette, tried on (RescueSection). */
  better?: { hex: string; tryOnPath: string };
  /** Store page the piece came from. */
  source?: { url: string; title: string | null };
}

export interface SavedHairstyle {
  templateId: string;
  title: string;
  code?: string;
  params?: Record<string, string | number>;
}

export interface SavedLook {
  id: string;
  name: string | null;
  createdAt: string;
  updatedAt: string | null;
  pieces: SavedPiece[];
  outfit: OutfitResult | null;
  outfitPath: string | null;
  facePath: string | null;
  fullPath: string | null;
  makeup: MakeupStep[] | null;
  hairstyle: SavedHairstyle | null;
}

export interface LookToSave {
  name: string | null;
  pieces: Array<{ slot: Slot; trial: Trial }>;
  outfitUrl: string | null;
  outfit: OutfitResult | null;
  faceUrl: string | null;
  fullUrl: string | null;
  makeup: MakeupStep[] | null;
  hairstyle: SavedHairstyle | null;
}

interface LookRow {
  id: string;
  name?: string | null;
  created_at: string;
  updated_at?: string | null;
  pieces: SavedPiece[];
  outfit_verdict: OutfitResult | null;
  outfit_path: string | null;
  face_path: string | null;
  full_look_path?: string | null;
  makeup: MakeupStep[] | null;
  hairstyle: SavedHairstyle | null;
}

function fromRow(r: LookRow): SavedLook {
  return {
    id: r.id,
    name: r.name ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at ?? null,
    pieces: r.pieces ?? [],
    outfit: r.outfit_verdict,
    outfitPath: r.outfit_path,
    facePath: r.face_path,
    fullPath: r.full_look_path ?? null,
    makeup: r.makeup,
    hairstyle: r.hairstyle,
  };
}

export const LOOK_NAME_MAX = 60;

/** A look's name as stored: trimmed, at most LOOK_NAME_MAX characters, null when empty. */
export const lookName = (name: string | null | undefined) => name?.trim().slice(0, LOOK_NAME_MAX).trim() || null;

export function lookImagePaths(look: SavedLook): string[] {
  return [look.fullPath, look.outfitPath, look.facePath, ...look.pieces.flatMap((p) => [p.garmentPath, p.tryOnPath, p.better?.tryOnPath])].filter(
    (p): p is string => !!p,
  );
}

/**
 * Saves a new look, or replaces one saved earlier (`existing`). Images get fresh names,
 * so the old ones are removed only after the row points to the new ones.
 */
export async function saveLook(input: LookToSave, existing?: SavedLook | null): Promise<SavedLook> {
  const { sb, uid } = await signedInClient();
  const id = existing?.id ?? crypto.randomUUID();
  const base = `${uid}/looks/${id}`;
  const stamp = Date.now().toString(36);
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
        const path = await uploadImage(`${base}/${name}-${stamp}`, src);
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
      const betterPath = trial.betterHex ? await upload(`piece-${i}-color`, trial.betterUrl).catch(() => null) : null;
      pieces.push({
        slot,
        attrs: g.attrs,
        color: g.color,
        result: trial.result ?? null,
        draft: trial.draft ?? null,
        draftLocale: trial.draftLocale ?? null,
        garmentPath: (await upload(`piece-${i}`, g.isolatedUrl, g.upload))!,
        tryOnPath: await upload(`piece-${i}-on`, trial.tryOnUrl).catch(() => null),
        ...(betterPath ? { better: { hex: trial.betterHex!, tryOnPath: betterPath } } : {}),
        ...(g.source ? { source: g.source } : {}),
      });
    }
    const row = {
      name: lookName(input.name),
      pieces,
      outfit_verdict: input.outfit,
      outfit_path: outfitPath,
      face_path: await upload("face", input.faceUrl),
      full_look_path: await upload("full", input.fullUrl).catch(() => null),
      makeup: input.makeup,
      hairstyle: input.hairstyle,
      updated_at: new Date().toISOString(),
    };
    const query = existing
      ? sb.from("looks").update(row).eq("id", id).eq("user_id", uid)
      : sb.from("looks").insert({ id, user_id: uid, ...row });
    const { data, error } = await query.select().single<LookRow>();
    if (error || !data) throw new SaveError("generic");
    const saved = fromRow(data);
    if (existing) {
      const keep = new Set(lookImagePaths(saved));
      await removeImages(lookImagePaths(existing).filter((p) => !keep.has(p))).catch(() => undefined);
    }
    return saved;
  } catch (e) {
    await removeImages(uploaded).catch(() => undefined);
    throw e instanceof SaveError ? e : new SaveError("generic");
  }
}

export async function listLooks(): Promise<SavedLook[]> {
  const { sb, uid } = await signedInClient();
  const { data, error } = await sb.from("looks").select("*").eq("user_id", uid).order("created_at", { ascending: false });
  if (error) throw new SaveError("generic");
  return (data as LookRow[]).map(fromRow);
}

/** Names a saved look, or clears its name, without touching its images. */
export async function renameLook(look: SavedLook, name: string | null): Promise<SavedLook> {
  const { sb, uid } = await signedInClient();
  const { data, error } = await sb
    .from("looks")
    .update({ name: lookName(name) })
    .eq("id", look.id)
    .eq("user_id", uid)
    .select()
    .single<LookRow>();
  if (error || !data) throw new SaveError("generic");
  return fromRow(data);
}

export async function deleteLook(look: SavedLook) {
  const { sb, uid } = await signedInClient();
  await removeImages([...new Set(lookImagePaths(look))]);
  const { error } = await sb.from("looks").delete().eq("id", look.id).eq("user_id", uid);
  if (error) throw new SaveError("generic");
}

/** A transparent PNG garment flattened onto white: what the clothes try-on expects. */
async function onWhite(blob: Blob): Promise<Blob> {
  if (blob.type !== "image/png") return blob;
  const img = await loadImage(blob);
  const canvas = toCanvas(img, 1600);
  const flat = document.createElement("canvas");
  flat.width = canvas.width;
  flat.height = canvas.height;
  const ctx = flat.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, flat.width, flat.height);
  ctx.drawImage(canvas, 0, 0);
  return canvasToBlob(flat);
}

/** A saved look turned back into session pieces, so it can be edited and saved again. */
export async function openSavedLook(saved: SavedLook) {
  const paths = [...new Set(lookImagePaths(saved))];
  const blobs = Object.fromEntries(await Promise.all(paths.map(async (p) => [p, await downloadImage(p)] as const)));
  const urls = new Map<string, string>();
  // One object URL per stored image: a single-piece look stores its try-on once, as the outfit too.
  const url = (p: string | null) => {
    if (!p || !blobs[p]) return undefined;
    if (!urls.has(p)) urls.set(p, URL.createObjectURL(blobs[p]));
    return urls.get(p);
  };
  const stamp = Date.now();
  const trials: Trial[] = await Promise.all(
    saved.pieces.map(async (p, i) => {
      const garment = blobs[p.garmentPath];
      const shown = url(p.garmentPath)!;
      return {
        garment: {
          id: `${saved.id}-${i}-${stamp}`,
          originalUrl: shown,
          upload: await onWhite(garment),
          isolatedUrl: garment.type === "image/png" ? shown : null,
          clusters: [{ hex: p.color.hex, share: p.color.share }],
          multicolor: false,
          color: p.color,
          attrs: p.attrs,
          isGarment: true,
          attrsSource: "claude" as const,
          source: p.source,
        },
        tryOnUrl: url(p.tryOnPath),
        betterUrl: url(p.better?.tryOnPath ?? null),
        betterHex: p.better?.hex,
        result: p.result ?? undefined,
        draft: p.draft ?? undefined,
        draftLocale: p.draftLocale ?? undefined,
      };
    }),
  );
  return {
    trials,
    slots: saved.pieces.map((p) => p.slot),
    outfitUrl: url(saved.outfitPath),
    faceUrl: url(saved.facePath),
    fullUrl: url(saved.fullPath),
  };
}
