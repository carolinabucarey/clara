import { describe, expect, it } from "vitest";
import { deltaE, hexToLab, rgbToLab } from "./lab";
import { flattenOnto, recolorPixels } from "./recolor";

const px = (...colors: Array<[number, number, number, number]>) => new Uint8ClampedArray(colors.flat());
const labAt = (d: Uint8ClampedArray, i: number) => rgbToLab({ r: d[i * 4], g: d[i * 4 + 1], b: d[i * 4 + 2] });

describe("recolorPixels", () => {
  it("moves the main color to the target and keeps far colors", () => {
    // cobalt main color, a darker fold of it, a white button, a transparent pixel
    const data = px([28, 76, 170, 255], [18, 50, 120, 255], [250, 250, 250, 255], [28, 76, 170, 0]);
    const changed = recolorPixels(data, "#1c4caa", "#b5523b");
    expect(changed).toBe(2);
    expect(deltaE(labAt(data, 0), hexToLab("#b5523b"))).toBeLessThan(6);
    // the fold stays darker than the recolored main color (shading kept)
    expect(labAt(data, 1).L).toBeLessThan(labAt(data, 0).L);
    expect(Array.from(data.slice(8, 12))).toEqual([250, 250, 250, 255]);
    expect(Array.from(data.slice(12, 16))).toEqual([28, 76, 170, 0]);
  });
});

describe("flattenOnto", () => {
  it("composites transparent pixels over white", () => {
    const data = px([0, 0, 0, 0], [0, 0, 0, 255], [0, 0, 0, 128]);
    flattenOnto(data);
    expect(Array.from(data)).toEqual([255, 255, 255, 255, 0, 0, 0, 255, 127, 127, 127, 255]);
  });
});
