"use client";

// Shareable PNG cards (1080×1350) drawn on a canvas: a verdict, a comparison, a look, a before and after.

import { loadImage } from "./image";
import type { OutfitVerdict, Verdict, VerdictDraft, VerdictResult } from "./types";

const W = 1080;
const H = 1350;

const COLORS: Record<Verdict | OutfitVerdict, { bg: string; fg: string }> = {
  flatters: { bg: "#e3eee4", fg: "#4f7a5a" },
  works_together: { bg: "#e3eee4", fg: "#4f7a5a" },
  works_with_tweaks: { bg: "#f6ead2", fg: "#a86d12" },
  not_flattering: { bg: "#f5e0e4", fg: "#a63d52" },
  clash: { bg: "#f5e0e4", fg: "#a63d52" },
};

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines = 6) {
  const words = text.split(/\s+/);
  let line = "";
  let lines = 0;
  for (let i = 0; i < words.length; i++) {
    const test = line ? `${line} ${words[i]}` : words[i];
    if (ctx.measureText(test).width > maxWidth && line) {
      if (lines === maxLines - 1) {
        ctx.fillText(`${line}…`, x, y);
        return y + lineHeight;
      }
      ctx.fillText(line, x, y);
      line = words[i];
      y += lineHeight;
      lines++;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, y);
  return y + lineHeight;
}

function cover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number, radius = 28) {
  const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / s;
  const sh = h / s;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.clip();
  ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
  ctx.restore();
}

/** A blank card with the Clara header; returns the context and the page fonts. */
async function card(title: string) {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  await document.fonts?.ready;
  const serif = `${getComputedStyle(document.body).getPropertyValue("--font-fraunces") || "Georgia"}, Georgia, serif`;
  const sans = `${getComputedStyle(document.body).getPropertyValue("--font-inter") || "system-ui"}, system-ui, sans-serif`;

  ctx.fillStyle = "#faf6f1";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#241c17";
  ctx.font = `600 64px ${serif}`;
  ctx.fillText("Clara", 72, 120);
  ctx.font = `400 30px ${sans}`;
  ctx.fillStyle = "#6f625a";
  ctx.fillText(title, 72, 168);
  return { canvas, ctx, serif, sans };
}

/** A verdict pill whose top-left corner is (x, y), shrunk to fit `maxWidth`; returns its height. */
function pill(ctx: CanvasRenderingContext2D, sans: string, x: number, y: number, label: string, tone: Verdict | OutfitVerdict, size = 30, maxWidth = Infinity) {
  ctx.font = `600 ${size}px ${sans}`;
  while (size > 16 && ctx.measureText(label).width + size * 1.6 > maxWidth) {
    size -= 2;
    ctx.font = `600 ${size}px ${sans}`;
  }
  const h = Math.round(size * 1.87);
  ctx.fillStyle = COLORS[tone].bg;
  ctx.beginPath();
  ctx.roundRect(x, y, ctx.measureText(label).width + size * 1.6, h, h / 2);
  ctx.fill();
  ctx.fillStyle = COLORS[tone].fg;
  ctx.fillText(label, x + size * 0.8, y + h * 0.68);
  return h;
}

/** Divider, footer text and the person's palette at the bottom of the card. */
function footer(ctx: CanvasRenderingContext2D, sans: string, text: string, palette: string[]) {
  ctx.fillStyle = "#e4d8cb";
  ctx.fillRect(72, 1040, W - 144, 2);
  ctx.font = `400 26px ${sans}`;
  ctx.fillStyle = "#6f625a";
  wrap(ctx, text, 72, 1100, W - 144, 36, 3);
  palette.slice(0, 6).forEach((hex, i) => {
    ctx.fillStyle = hex;
    ctx.beginPath();
    ctx.arc(96 + i * 64, 1240, 24, 0, Math.PI * 2);
    ctx.fill();
  });
}

const png = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode_failed"))), "image/png"));

export async function renderShareCard(opts: {
  imageUrl: string;
  result: VerdictResult;
  draft?: VerdictDraft;
  labels: { title: string; cut: string; color: string; levels: Record<Verdict, string>; footer: string };
  fallbackText: { cut: string; color: string };
}): Promise<Blob> {
  const { canvas, ctx, serif, sans } = await card(opts.labels.title);

  const img = await loadImage(opts.imageUrl);
  cover(ctx, img, 72, 220, 470, 760);

  let y = 260;
  const x = 590;
  const maxW = W - x - 72;
  for (const axis of ["cut", "color"] as const) {
    const v = opts.result[axis].verdict;
    ctx.font = `600 26px ${sans}`;
    ctx.fillStyle = "#6f625a";
    ctx.fillText(opts.labels[axis].toUpperCase(), x, y);
    y += 22;
    pill(ctx, sans, x, y, opts.labels.levels[v], v);
    y += 100;
    ctx.fillStyle = "#241c17";
    ctx.font = `500 30px ${serif}`;
    const text = opts.draft ? `${opts.draft[axis].headline}. ${opts.draft[axis].body}` : opts.fallbackText[axis];
    y = wrap(ctx, text, x, y, maxW, 40, 7) + 40;
  }

  footer(ctx, sans, opts.labels.footer, opts.result.palette);
  return png(canvas);
}

/** At most this many pieces fit side by side on a compare card. */
export const COMPARE_CARD_MAX = 3;

/** The pieces compared side by side, Clara's pick outlined. */
export async function renderCompareCard(opts: {
  items: Array<{ imageUrl: string; cut: Verdict; color: Verdict; best: boolean }>;
  palette: string[];
  labels: { title: string; cut: string; color: string; levels: Record<Verdict, string>; best: string; footer: string };
}): Promise<Blob> {
  const { canvas, ctx, sans } = await card(opts.labels.title);
  const items = opts.items.slice(0, COMPARE_CARD_MAX);
  const imgs = await Promise.all(items.map((it) => loadImage(it.imageUrl)));

  const gap = 32;
  const cellW = (W - 144 - gap * (items.length - 1)) / items.length;
  const size = items.length > 2 ? 22 : 26;
  const pillH = Math.round(size * 1.87);
  // Below the photo: two label + pill pairs, then the line for Clara's pick.
  const axisH = 10 + pillH + size + 12;
  const textH = size + 14 + 2 * axisH + 20;
  const imgW = Math.min(cellW - 32, ((1000 - 220 - 16 - textH) * 3) / 4);
  const imgH = (imgW * 4) / 3;
  const cellH = 16 + imgH + textH;

  items.forEach((it, i) => {
    const cx = 72 + i * (cellW + gap);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.roundRect(cx, 220, cellW, cellH, 32);
    ctx.fill();
    ctx.lineWidth = it.best ? 6 : 2;
    ctx.strokeStyle = it.best ? COLORS.flatters.fg : "#e4d8cb";
    ctx.stroke();

    const ix = cx + (cellW - imgW) / 2;
    cover(ctx, imgs[i], ix, 236, imgW, imgH, 20);

    let y = 236 + imgH + size + 14;
    for (const axis of ["cut", "color"] as const) {
      ctx.font = `500 ${size - 2}px ${sans}`;
      ctx.fillStyle = "#6f625a";
      ctx.fillText(opts.labels[axis], ix, y);
      pill(ctx, sans, ix, y + 10, opts.labels.levels[it[axis]], it[axis], size, cx + cellW - 16 - ix);
      y += axisH;
    }
    if (it.best) {
      ctx.font = `600 ${size}px ${sans}`;
      ctx.fillStyle = COLORS.flatters.fg;
      ctx.fillText(`★ ${opts.labels.best}`, ix, y);
    }
  });

  footer(ctx, sans, opts.labels.footer, opts.palette);
  return png(canvas);
}

/** The finished look: the outfit photo, the hair and makeup portrait if any, and its pieces. */
export async function renderLookCard(opts: {
  imageUrl: string;
  portraitUrl?: string;
  pieces: Array<{ imageUrl?: string; hex: string; label: string }>;
  outfit?: { verdict: OutfitVerdict; label: string };
  palette: string[];
  labels: { title: string; footer: string };
}): Promise<Blob> {
  const { canvas, ctx, sans } = await card(opts.labels.title);
  const [img, portrait, ...thumbs] = await Promise.all([
    loadImage(opts.imageUrl),
    opts.portraitUrl ? loadImage(opts.portraitUrl).catch(() => null) : null,
    ...opts.pieces.map((p) => (p.imageUrl ? loadImage(p.imageUrl).catch(() => null) : null)),
  ]);
  cover(ctx, img, 72, 220, 470, 760);

  const x = 590;
  const maxW = W - x - 72;
  let y = 220;
  if (portrait) {
    cover(ctx, portrait, x, y, 300, 375);
    y += 375 + 36;
  }
  opts.pieces.slice(0, 4).forEach((p, i) => {
    ctx.fillStyle = "#f3ece4";
    ctx.beginPath();
    ctx.roundRect(x, y, maxW, 104, 24);
    ctx.fill();
    const thumb = thumbs[i];
    if (thumb) {
      const s = Math.min(80 / thumb.naturalWidth, 80 / thumb.naturalHeight);
      const tw = thumb.naturalWidth * s;
      const th = thumb.naturalHeight * s;
      ctx.drawImage(thumb, x + 12 + (80 - tw) / 2, y + 12 + (80 - th) / 2, tw, th);
    }
    ctx.fillStyle = p.hex;
    ctx.beginPath();
    ctx.arc(x + 120, y + 52, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `500 24px ${sans}`;
    ctx.fillStyle = "#241c17";
    const oneLine = ctx.measureText(p.label).width <= maxW - 160;
    wrap(ctx, p.label, x + 146, y + (oneLine ? 60 : 45), maxW - 160, 30, 2);
    y += 104 + 16;
  });
  if (opts.outfit) pill(ctx, sans, x, y + 12, opts.outfit.label, opts.outfit.verdict, 28, maxW);

  footer(ctx, sans, opts.labels.footer, opts.palette);
  return png(canvas);
}

/** Two photos side by side, each with its caption and color: the piece in your color, the lipstick. */
export async function renderBeforeAfterCard(opts: {
  before: { imageUrl: string; label: string; hex?: string };
  after: { imageUrl: string; label: string; hex?: string };
  text?: string;
  palette: string[];
  labels: { title: string; footer: string };
}): Promise<Blob> {
  const { canvas, ctx, serif, sans } = await card(opts.labels.title);
  const sides = [opts.before, opts.after];
  const imgs = await Promise.all(sides.map((s) => loadImage(s.imageUrl)));

  const gap = 32;
  const w = (W - 144 - gap) / 2;
  const h = (w * 4) / 3;
  sides.forEach((s, i) => {
    const x = 72 + i * (w + gap);
    cover(ctx, imgs[i], x, 220, w, h);
    // The caption centered under its photo, after the color dot.
    ctx.font = `500 28px ${sans}`;
    const dot = s.hex ? 40 : 0;
    const left = x + (w - dot - ctx.measureText(s.label).width) / 2;
    const y = 220 + h + 52;
    if (s.hex) {
      ctx.fillStyle = s.hex;
      ctx.beginPath();
      ctx.arc(left + 14, y - 10, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.1)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.fillStyle = "#241c17";
    ctx.fillText(s.label, left + dot, y);
  });

  if (opts.text) {
    ctx.fillStyle = "#241c17";
    ctx.font = `500 30px ${serif}`;
    wrap(ctx, opts.text, 72, 220 + h + 112, W - 144, 40, 3);
  }

  footer(ctx, sans, opts.labels.footer, opts.palette);
  return png(canvas);
}

let shareFiles: boolean | undefined;

/** Whether this browser can hand an image to the system share sheet (phones, Safari). */
export function canShareFiles() {
  shareFiles ??= !!navigator.canShare?.({ files: [new File([""], "clara.png", { type: "image/png" })] });
  return shareFiles;
}

/** Opens the share sheet where the browser supports it; elsewhere downloads the image. */
export async function shareImage(blob: Blob, filename: string) {
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "Clara" });
      return;
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      // Otherwise (e.g. the tap's permission ran out while drawing the card): download instead.
    }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
