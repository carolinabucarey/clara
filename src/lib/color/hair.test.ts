import { describe, expect, it } from "vitest";
import { hairColorChanged, hairStats, matchLightness, transferHairColor, type HairMask } from "./hair";
import { deltaE, hexToRgb } from "./lab";

const W = 20;
const H = 20;
const SKIN = "#d9a98a";

/** A 20×20 photo: the top half is hair (cycling through `hair`), the bottom half skin. */
function photo(hair: string[]): { pixels: Uint8ClampedArray; mask: HairMask } {
  const pixels = new Uint8ClampedArray(W * H * 4);
  const mask = { data: new Float32Array(W * H), width: W, height: H };
  for (let i = 0; i < W * H; i++) {
    const isHair = i < (W * H) / 2;
    const { r, g, b } = hexToRgb(isHair ? hair[i % hair.length] : SKIN);
    pixels.set([r, g, b, 255], i * 4);
    mask.data[i] = isHair ? 1 : 0;
  }
  return { pixels, mask };
}

const WHITE = ["#f2f2f0", "#e6e6e3", "#d9d9d6", "#fafaf8"];
const BROWN = ["#3b2a20", "#4a3628", "#2e211a", "#5a4332"];

describe("hair color across a try-on", () => {
  it("measures the hair, and gives up when there is too little of it", () => {
    const { pixels, mask } = photo(BROWN);
    const stats = hairStats(pixels, W, H, mask)!;
    expect(stats.share).toBeCloseTo(0.5);
    expect(stats.mean.L).toBeLessThan(30);
    expect(stats.lightness[0]).toBeLessThanOrEqual(stats.lightness[100]);
    expect(hairStats(pixels, W, H, { ...mask, data: new Float32Array(W * H) })).toBeNull();
  });

  it("notices when dark hair came back platinum, not a small drift", () => {
    const brown = photo(BROWN);
    const white = photo(WHITE);
    const own = hairStats(brown.pixels, W, H, brown.mask)!;
    expect(hairColorChanged(own, hairStats(white.pixels, W, H, white.mask)!)).toBe(true);
    const drift = photo(["#3f2d22", "#4d3829", "#31231b", "#5c4533"]);
    expect(hairColorChanged(own, hairStats(drift.pixels, W, H, drift.mask)!)).toBe(false);
  });

  it("puts the person's color back on the new hair and leaves the skin alone", () => {
    const brown = photo(BROWN);
    const own = hairStats(brown.pixels, W, H, brown.mask)!;
    const white = photo(WHITE);
    // A skin pixel the mask wrongly calls hair.
    const { r, g, b } = hexToRgb(SKIN);
    white.pixels.set([r, g, b, 255], 0);
    const skinBefore = white.pixels.slice((W * H) / 2 * 4);
    transferHairColor(white.pixels, W, H, white.mask, hairStats(white.pixels, W, H, white.mask)!, own);

    const restored = hairStats(white.pixels, W, H, { ...white.mask, data: white.mask.data.map((v, i) => (i === 0 ? 0 : v)) })!;
    expect(deltaE(restored.mean, own.mean)).toBeLessThan(5);
    expect(Array.from(white.pixels.slice(0, 3))).toEqual([r, g, b]);
    expect(white.pixels.slice((W * H) / 2 * 4)).toEqual(skinBefore);
  });

  it("maps lightness by percentile and clamps outside the range", () => {
    const from = Float32Array.from({ length: 101 }, (_, p) => 50 + p * 0.4);
    const to = Float32Array.from({ length: 101 }, (_, p) => 10 + p * 0.3);
    expect(matchLightness(70, from, to)).toBeCloseTo(25);
    expect(matchLightness(20, from, to)).toBe(10);
    expect(matchLightness(99, from, to)).toBe(40);
  });
});
