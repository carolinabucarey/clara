import { describe, expect, it } from "vitest";
import { LM, measureBody, rowWidth, type Landmark, type MaskInput } from "./measure";

const W = 200;
const H = 400;

/** A synthetic front-facing silhouette: half-widths (px) per normalized height. */
function silhouette(halfWidth: (yn: number) => number): MaskInput {
  const data = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const hw = halfWidth(y / H);
    for (let x = Math.round(100 - hw); x <= Math.round(100 + hw); x++) if (x >= 0 && x < W) data[y * W + x] = 1;
  }
  return { data, width: W, height: H };
}

function landmarks(opts: { shoulderY: number; hipY: number; ankleY?: number; wristX?: number }): Landmark[] {
  const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0 }));
  const set = (i: number, x: number, y: number, v = 0.99) => (lm[i] = { x, y, z: 0, visibility: v });
  set(LM.leftShoulder, 0.6, opts.shoulderY);
  set(LM.rightShoulder, 0.4, opts.shoulderY);
  set(LM.leftHip, 0.56, opts.hipY);
  set(LM.rightHip, 0.44, opts.hipY);
  if (opts.ankleY) {
    set(LM.leftAnkle, 0.55, opts.ankleY);
    set(LM.rightAnkle, 0.45, opts.ankleY);
  }
  const wx = opts.wristX ?? 0.9;
  set(LM.leftWrist, wx, (opts.shoulderY + opts.hipY) / 2 + 0.05);
  set(LM.rightWrist, 1 - wx, (opts.shoulderY + opts.hipY) / 2 + 0.05);
  return lm;
}

describe("rowWidth", () => {
  it("measures the run that contains the center", () => {
    const mask = silhouette(() => 20);
    expect(rowWidth(mask, 100, 100).width).toBe(41);
  });
});

describe("measureBody", () => {
  it("reads an hourglass-like frame as balanced with a defined waist", () => {
    // shoulders 0.2, waist ~0.33, hips 0.45 (normalized y), legs to 0.95
    const mask = silhouette((y) => {
      if (y < 0.15) return 12;
      if (y < 0.22) return 40;
      if (y < 0.4) return 40 - ((y - 0.22) / 0.18) * 13; // taper to waist 27
      if (y < 0.5) return 27 + ((y - 0.4) / 0.1) * 12; // to hips 39
      return 30;
    });
    const p = measureBody({ landmarks: landmarks({ shoulderY: 0.2, hipY: 0.48, ankleY: 0.95 }), mask, heightCm: 165 });
    expect(p.balance).toBe("balanced");
    expect(p.waist).toBe("defined");
    expect(p.height).toBe("average");
    expect(p.torsoLeg).not.toBeNull();
    expect(p.confidence).toBe("high");
  });

  it("reads wider hips and a straight waist", () => {
    const mask = silhouette((y) => {
      if (y < 0.15) return 12;
      if (y < 0.45) return 32;
      if (y < 0.6) return 40;
      return 30;
    });
    const p = measureBody({ landmarks: landmarks({ shoulderY: 0.2, hipY: 0.48, ankleY: 0.95 }), mask, heightCm: 152 });
    expect(p.balance).toBe("hips_wider");
    expect(p.height).toBe("petite");
  });

  it("lowers confidence when ankles are hidden, arms touch the body, or clothes are loose", () => {
    const mask = silhouette((y) => (y < 0.15 ? 12 : 36));
    const p = measureBody({
      landmarks: landmarks({ shoulderY: 0.2, hipY: 0.48, wristX: 0.6 }),
      mask,
      heightCm: 175,
      looseClothing: true,
    });
    expect(p.issues).toEqual(expect.arrayContaining(["ankles_not_visible", "arms_close_to_body", "loose_clothing"]));
    expect(p.confidence).toBe("low");
    expect(p.torsoLeg).toBeNull();
    expect(p.shoulderHip.high - p.shoulderHip.low).toBeCloseTo(0.16, 5);
  });

  it("throws a readable code when the body is not found", () => {
    const lm = landmarks({ shoulderY: 0.2, hipY: 0.48 });
    lm[LM.leftHip].visibility = 0.1;
    expect(() => measureBody({ landmarks: lm, mask: silhouette(() => 20), heightCm: 160 })).toThrow("pose_not_found");
  });
});
