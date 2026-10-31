"use client";

// Renders the verdict as a shareable PNG card (1080×1350) on a canvas.

import { loadImage } from "./image";
import type { Verdict, VerdictDraft, VerdictResult } from "./types";

const COLORS: Record<Verdict, { bg: string; fg: string }> = {
  flatters: { bg: "#e3eee4", fg: "#4f7a5a" },
  works_with_tweaks: { bg: "#f6ead2", fg: "#a86d12" },
  not_flattering: { bg: "#f5e0e4", fg: "#a63d52" },
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

function cover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / s;
  const sh = h / s;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 28);
  ctx.clip();
  ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
  ctx.restore();
}

export async function renderShareCard(opts: {
  imageUrl: string;
  result: VerdictResult;
  draft?: VerdictDraft;
  labels: { title: string; cut: string; color: string; levels: Record<Verdict, string>; footer: string };
  fallbackText: { cut: string; color: string };
}): Promise<Blob> {
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  await document.fonts?.ready;
  const serif = getComputedStyle(document.body).getPropertyValue("--font-fraunces") || "Georgia";
  const sans = getComputedStyle(document.body).getPropertyValue("--font-inter") || "system-ui";

  ctx.fillStyle = "#faf6f1";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#241c17";
  ctx.font = `600 64px ${serif}, Georgia, serif`;
  ctx.fillText("Clara", 72, 120);
  ctx.font = `400 30px ${sans}, system-ui, sans-serif`;
  ctx.fillStyle = "#6f625a";
  ctx.fillText(opts.labels.title, 72, 168);

  const img = await loadImage(opts.imageUrl);
  cover(ctx, img, 72, 220, 470, 760);

  let y = 260;
  const x = 590;
  const maxW = W - x - 72;
  for (const axis of ["cut", "color"] as const) {
    const v = opts.result[axis].verdict;
    ctx.font = `600 26px ${sans}, system-ui, sans-serif`;
    ctx.fillStyle = "#6f625a";
    ctx.fillText(opts.labels[axis].toUpperCase(), x, y);
    y += 22;
    const label = opts.labels.levels[v];
    ctx.font = `600 30px ${sans}, system-ui, sans-serif`;
    const pw = ctx.measureText(label).width + 48;
    ctx.fillStyle = COLORS[v].bg;
    ctx.beginPath();
    ctx.roundRect(x, y, pw, 56, 28);
    ctx.fill();
    ctx.fillStyle = COLORS[v].fg;
    ctx.fillText(label, x + 24, y + 38);
    y += 100;
    ctx.fillStyle = "#241c17";
    ctx.font = `500 30px ${serif}, Georgia, serif`;
    const text = opts.draft ? `${opts.draft[axis].headline}. ${opts.draft[axis].body}` : opts.fallbackText[axis];
    y = wrap(ctx, text, x, y, maxW, 40, 7) + 40;
  }

  ctx.fillStyle = "#e4d8cb";
  ctx.fillRect(72, 1040, W - 144, 2);
  ctx.font = `400 26px ${sans}, system-ui, sans-serif`;
  ctx.fillStyle = "#6f625a";
  wrap(ctx, opts.labels.footer, 72, 1100, W - 144, 36, 3);
  const swatches = opts.result.palette.slice(0, 6);
  swatches.forEach((hex, i) => {
    ctx.fillStyle = hex;
    ctx.beginPath();
    ctx.arc(96 + i * 64, 1240, 24, 0, Math.PI * 2);
    ctx.fill();
  });

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode_failed"))), "image/png"));
}
