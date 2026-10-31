// A look groups the pieces tried in this session (by slot) so they can be tried on
// together. Pure helpers: which piece goes in which slot, and how to build the
// outfit image from try-ons that already exist instead of starting over.

import type { GarmentCategory, Slot } from "./types";

export type Pieces = Partial<Record<Slot, number>>;

/** Base garments first, the outer layer last (YouCam's recommended order for layering). */
const WEAR_ORDER: Slot[] = ["top", "full", "bottom", "outer"];

export function wearOrder(pieces: Pieces): Slot[] {
  return WEAR_ORDER.filter((s) => pieces[s] !== undefined);
}

/** Puts a piece in its slot: a dress replaces the top and bottom, and the other way around. */
export function placePiece(pieces: Pieces, slot: Slot, index: number): Pieces {
  const next: Pieces = {};
  for (const s of WEAR_ORDER) if (pieces[s] !== undefined && pieces[s] !== index) next[s] = pieces[s];
  if (slot === "full") {
    delete next.top;
    delete next.bottom;
  } else if (slot === "top" || slot === "bottom") {
    delete next.full;
  }
  next[slot] = index;
  return next;
}

export function removePiece(pieces: Pieces, slot: Slot): Pieces {
  const next = { ...pieces };
  delete next[slot];
  return next;
}

/** Slots the look can still take, for the "add a piece" buttons. */
export function missingSlots(pieces: Pieces): Slot[] {
  const out: Slot[] = [];
  if (pieces.full === undefined) {
    if (pieces.top === undefined) out.push("top");
    if (pieces.bottom === undefined) out.push("bottom");
  }
  if (pieces.outer === undefined) out.push("outer");
  return out;
}

export interface TryOnState {
  garment: { id: string; attrs: { category: GarmentCategory } };
  tryOnUrl?: string;
  /** The image this piece was tried on over, when it was tried on as part of a look. */
  tryOnOverUrl?: string;
}

/** Identifies the outfit image: changes when a piece, its category or the body photo changes. */
export function outfitKey(pieces: Pieces, trials: TryOnState[], bodyUrl: string): string {
  return [bodyUrl, ...wearOrder(pieces).map((s) => `${s}:${trials[pieces[s]!].garment.id}:${trials[pieces[s]!].garment.attrs.category}`)].join("|");
}

/**
 * The makeup on the full-body photo, while it was made on this outfit: its key starts
 * with the outfit image it was applied to (BeautySection), so a change of pieces drops it.
 */
export function fullLookUrl(look: { fullUrl?: string; fullKey?: string }, outfitUrl: string | null | undefined): string | undefined {
  return outfitUrl && look.fullKey?.startsWith(`${outfitUrl}|`) ? look.fullUrl : undefined;
}

/**
 * How to get the outfit image with the fewest try-ons: start from a result that
 * already shows two pieces together, or from any single try-on, and apply the rest.
 */
export function outfitPlan(pieces: Pieces, trials: TryOnState[]): { baseUrl: string | null; steps: Slot[] } {
  const order = wearOrder(pieces);
  const t = (s: Slot) => trials[pieces[s]!];
  for (const s of order) {
    const over = t(s).tryOnOverUrl;
    const base = over && t(s).tryOnUrl ? order.find((o) => o !== s && t(o).tryOnUrl === over) : undefined;
    if (base) return { baseUrl: t(s).tryOnUrl!, steps: order.filter((o) => o !== s && o !== base) };
  }
  const first = order.find((s) => t(s).tryOnUrl);
  if (first) return { baseUrl: t(first).tryOnUrl!, steps: order.filter((o) => o !== first) };
  return { baseUrl: null, steps: order };
}

/**
 * Image a piece should be tried on over for its own verdict, so a bottom added to a
 * top is shown with that top. Never a result that already contains this piece.
 */
export function tryOnBaseFor(pieces: Pieces, trials: TryOnState[], index: number): string | undefined {
  const own = trials[index];
  for (const s of wearOrder(pieces)) {
    const i = pieces[s]!;
    if (i === index) continue;
    const other = trials[i];
    if (!other.tryOnUrl) continue;
    if (own.tryOnUrl && other.tryOnOverUrl === own.tryOnUrl) continue;
    return other.tryOnUrl;
  }
  return undefined;
}
