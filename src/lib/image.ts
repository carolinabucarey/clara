"use client";

// Canvas helpers for preparing photos in the browser before they are sent anywhere.

export function loadImage(src: string | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = typeof src === "string" ? src : URL.createObjectURL(src);
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    const release = () => {
      if (typeof src !== "string") URL.revokeObjectURL(url);
    };
    img.onload = () => { release(); resolve(img); };
    img.onerror = () => { release(); reject(new Error("image_load_failed")); };
    img.src = url;
  });
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Draws (a crop of) an image into a canvas, scaled so the long side is ≤ maxSide. */
export function toCanvas(img: HTMLImageElement | HTMLCanvasElement, maxSide = 1600, crop?: Rect): HTMLCanvasElement {
  const sw = crop?.width ?? (img instanceof HTMLImageElement ? img.naturalWidth : img.width);
  const sh = crop?.height ?? (img instanceof HTMLImageElement ? img.naturalHeight : img.height);
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(sh * scale));
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, crop?.x ?? 0, crop?.y ?? 0, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = "image/jpeg", quality = 0.9): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode_failed"))), type, quality),
  );
}

/** JPEG with the long side below YouCam's limits (makeup try-on wants < 1920). */
export async function prepareUpload(img: HTMLImageElement | HTMLCanvasElement, maxSide = 1600, crop?: Rect) {
  let canvas = toCanvas(img, maxSide, crop);
  let blob = await canvasToBlob(canvas);
  // Two images plus multipart overhead must fit within the hosting request limit.
  const maxBytes = 2 * 1024 * 1024;
  if (blob.size > maxBytes) blob = await canvasToBlob(canvas, "image/jpeg", 0.75);
  while (blob.size > maxBytes) {
    canvas = toCanvas(canvas, Math.max(canvas.width, canvas.height) * 0.8);
    blob = await canvasToBlob(canvas, "image/jpeg", 0.75);
  }
  return { blob, width: canvas.width, height: canvas.height, canvas };
}

export function imageSize(img: HTMLImageElement | HTMLCanvasElement) {
  return img instanceof HTMLImageElement
    ? { width: img.naturalWidth, height: img.naturalHeight }
    : { width: img.width, height: img.height };
}

/**
 * Crop around a face so it fills ~65% of the width: YouCam's skin-tone analysis
 * needs the face to be wider than 60% of the image. Keeps hair above the face.
 */
export function faceCrop(face: Rect, imgW: number, imgH: number, targetShare = 0.65): Rect {
  const width = Math.min(imgW, face.width / targetShare);
  const height = Math.min(imgH, width * 1.25);
  const cx = face.x + face.width / 2;
  const top = face.y - face.height * 0.45;
  const x = Math.max(0, Math.min(imgW - width, cx - width / 2));
  const y = Math.max(0, Math.min(imgH - height, top));
  return { x, y, width, height };
}

export function getPixels(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
