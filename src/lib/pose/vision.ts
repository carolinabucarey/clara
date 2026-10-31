"use client";

// Browser-only wrapper around MediaPipe Tasks Vision. Models and the WASM runtime
// are served from our own origin (public/models, public/mediapipe/wasm), so the
// photos never leave the device for pose or face detection.

import type { FaceDetector, ImageSegmenter, PoseLandmarker } from "@mediapipe/tasks-vision";
import type { HairMask } from "../color/hair";
import type { Landmark, MaskInput } from "./measure";

const WASM_PATH = "/mediapipe/wasm";

let filesetPromise: Promise<unknown> | null = null;
let posePromise: Promise<PoseLandmarker> | null = null;
let facePromise: Promise<FaceDetector> | null = null;
let hairPromise: Promise<ImageSegmenter> | null = null;

async function fileset() {
  const { FilesetResolver } = await import("@mediapipe/tasks-vision");
  filesetPromise ??= FilesetResolver.forVisionTasks(WASM_PATH);
  return filesetPromise as ReturnType<typeof FilesetResolver.forVisionTasks>;
}

async function poseLandmarker(): Promise<PoseLandmarker> {
  posePromise ??= (async () => {
    const { PoseLandmarker } = await import("@mediapipe/tasks-vision");
    const fs = await fileset();
    const create = (delegate: "GPU" | "CPU") =>
      PoseLandmarker.createFromOptions(fs, {
        baseOptions: { modelAssetPath: "/models/pose_landmarker_full.task", delegate },
        runningMode: "IMAGE",
        numPoses: 1,
        outputSegmentationMasks: true,
      });
    try {
      return await create("GPU");
    } catch {
      return await create("CPU");
    }
  })();
  return posePromise;
}

async function faceDetector(): Promise<FaceDetector> {
  facePromise ??= (async () => {
    const { FaceDetector } = await import("@mediapipe/tasks-vision");
    const fs = await fileset();
    const create = (delegate: "GPU" | "CPU") =>
      FaceDetector.createFromOptions(fs, {
        baseOptions: { modelAssetPath: "/models/blaze_face_short_range.tflite", delegate },
        runningMode: "IMAGE",
        minDetectionConfidence: 0.5,
      });
    try {
      return await create("GPU");
    } catch {
      return await create("CPU");
    }
  })();
  return facePromise;
}

async function hairSegmenter(): Promise<ImageSegmenter> {
  hairPromise ??= (async () => {
    const { ImageSegmenter } = await import("@mediapipe/tasks-vision");
    const fs = await fileset();
    const create = (delegate: "GPU" | "CPU") =>
      ImageSegmenter.createFromOptions(fs, {
        baseOptions: { modelAssetPath: "/models/hair_segmenter.tflite", delegate },
        runningMode: "IMAGE",
        outputConfidenceMasks: true,
        outputCategoryMask: false,
      });
    try {
      return await create("GPU");
    } catch {
      return await create("CPU");
    }
  })();
  return hairPromise;
}

export interface PoseDetection {
  landmarks: Landmark[];
  mask: MaskInput;
}

export async function detectPose(image: HTMLImageElement | HTMLCanvasElement): Promise<PoseDetection | null> {
  const landmarker = await poseLandmarker();
  const result = landmarker.detect(image);
  const landmarks = result.landmarks?.[0];
  const mpMask = result.segmentationMasks?.[0];
  if (!landmarks || !mpMask) {
    mpMask?.close();
    return null;
  }
  // Copy the mask out of MediaPipe's memory before closing it.
  const data = Float32Array.from(mpMask.getAsFloat32Array());
  const mask = { data, width: mpMask.width, height: mpMask.height };
  mpMask.close();
  return { landmarks: landmarks.map((l) => ({ x: l.x, y: l.y, z: l.z, visibility: l.visibility })), mask };
}

export interface FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
  score: number;
}

export async function detectFaces(image: HTMLImageElement | HTMLCanvasElement): Promise<FaceBox[]> {
  const detector = await faceDetector();
  const result = detector.detect(image);
  return result.detections
    .filter((d) => d.boundingBox)
    .map((d) => ({
      x: d.boundingBox!.originX,
      y: d.boundingBox!.originY,
      width: d.boundingBox!.width,
      height: d.boundingBox!.height,
      score: d.categories?.[0]?.score ?? 0,
    }))
    .sort((a, b) => b.width * b.height - a.width * a.height);
}

function segmentOnce(segmenter: ImageSegmenter, image: HTMLCanvasElement): HairMask | null {
  const result = segmenter.segment(image);
  const masks = result.confidenceMasks ?? [];
  const hair = masks[masks.length - 1]; // the model's last class is hair
  // Copy the mask out of MediaPipe's memory before closing it.
  const mask = hair ? { data: Float32Array.from(hair.getAsFloat32Array()), width: hair.width, height: hair.height } : null;
  result.close();
  return mask;
}

/** A copy with the highlights pushed down (gamma 4), so light hair stands out from a light wall. */
function darkened(image: HTMLCanvasElement): HTMLCanvasElement {
  const lut = Uint8ClampedArray.from({ length: 256 }, (_, v) => 255 * Math.pow(v / 255, 4));
  const copy = document.createElement("canvas");
  copy.width = image.width;
  copy.height = image.height;
  const ctx = copy.getContext("2d")!;
  ctx.drawImage(image, 0, 0);
  const px = ctx.getImageData(0, 0, copy.width, copy.height);
  for (let i = 0; i < px.data.length; i += 4) {
    px.data[i] = lut[px.data[i]];
    px.data[i + 1] = lut[px.data[i + 1]];
    px.data[i + 2] = lut[px.data[i + 2]];
  }
  ctx.putImageData(px, 0, 0);
  return copy;
}

/**
 * Hair confidence per pixel, or null when the model finds none. With `lightHair`, a
 * darkened copy is read too and the higher confidence kept: very light hair against
 * a light wall is half missed otherwise.
 */
export async function segmentHair(image: HTMLCanvasElement, { lightHair = false } = {}): Promise<HairMask | null> {
  const segmenter = await hairSegmenter();
  const mask = segmentOnce(segmenter, image);
  if (!mask || !lightHair) return mask;
  const extra = segmentOnce(segmenter, darkened(image));
  if (extra?.width === mask.width && extra.height === mask.height) {
    for (let i = 0; i < mask.data.length; i++) mask.data[i] = Math.max(mask.data[i], extra.data[i]);
  }
  return mask;
}

/** Warm up the models in the background so the first analysis feels instant. */
export function preloadVision() {
  void poseLandmarker().catch(() => undefined);
  void faceDetector().catch(() => undefined);
}
