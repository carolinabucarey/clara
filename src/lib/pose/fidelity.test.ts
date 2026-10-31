import { describe, expect, it } from "vitest";
import { fidelityIssues, meanDeltaE } from "./fidelity";

const face = { x: 300, y: 100, width: 120, height: 150 };

describe("meanDeltaE", () => {
  it("is zero for identical crops and grows with color changes", () => {
    const a = new Uint8ClampedArray([200, 150, 120, 255, 200, 150, 120, 255]);
    expect(meanDeltaE(a, a.slice())).toBe(0);
    const b = new Uint8ClampedArray([120, 90, 70, 255, 120, 90, 70, 255]);
    expect(meanDeltaE(a, b)).toBeGreaterThan(20);
  });
});

describe("fidelityIssues", () => {
  it("accepts a faithful try-on", () => {
    expect(fidelityIssues({ original: face, result: { ...face, x: 305 }, width: 720, faceDeltaE: 5 })).toEqual([]);
  });
  it("flags a missing, moved, resized or recolored face", () => {
    expect(fidelityIssues({ original: face, result: null, width: 720, faceDeltaE: null })).toEqual(["face_missing"]);
    expect(
      fidelityIssues({ original: face, result: { x: 420, y: 100, width: 170, height: 200 }, width: 720, faceDeltaE: 20 }),
    ).toEqual(["face_moved", "face_resized", "face_changed"]);
  });
  it("has nothing to say without an original face", () => {
    expect(fidelityIssues({ original: null, result: null, width: 720, faceDeltaE: null })).toEqual([]);
  });
});
