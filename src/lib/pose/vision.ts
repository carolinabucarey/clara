"use client";

// Browser-only wrapper around MediaPipe Tasks Vision. Models and the WASM runtime
// are served from our own origin (public/models, public/mediapipe/wasm), so the
// photos never leave the device for pose or face detection.

import type { FaceDetector, PoseLandmarker } from "@mediapipe/tasks-vision";
import type { Landmark, MaskInput } from "./measure";

const WASM_PATH = "/mediapipe/wasm";

let filesetPromise: Promise<unknown> | null = null;
let posePromise: Promise<PoseLandmarker> | null = null;
let facePromise: Promise<FaceDetector> | null = null;

async function fileset() {
  const { FilesetResolver } = await import("@mediapipe/tasks-vision");
  filesetPromise ??= FilesetResolver.forVisionTasks(WASM_PATH).catch((err) => {
    filesetPromise = null;
    throw err;
  });
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
  })().catch((err) => {
    posePromise = null;
    throw err;
  });
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
  })().catch((err) => {
    facePromise = null;
    throw err;
  });
  return facePromise;
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

/** Warm up the models in the background so the first analysis feels instant. */
export function preloadVision() {
  void poseLandmarker().catch(() => undefined);
  void faceDetector().catch(() => undefined);
}
