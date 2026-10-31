import { describe, expect, it } from "vitest";
import { deltaE, hexToLab, hexToLch, labToHex } from "./lab";
import { buildColorProfile, classifyContrast, classifyDepth, classifyUndertone } from "./profile";
import { colorName, describeGarmentColor } from "./garment";
import { dominantColors, looksMulticolor } from "./dominant";

describe("lab", () => {
  it("round-trips hex through CIELAB", () => {
    for (const hex of ["#000000", "#ffffff", "#b28e73", "#2f4f8f", "#e2725b"]) {
      expect(labToHex(hexToLab(hex))).toBe(hex);
    }
  });
  it("matches reference values for sRGB red", () => {
    const lab = hexToLab("#ff0000");
    expect(lab.L).toBeCloseTo(53.24, 1);
    expect(lab.a).toBeCloseTo(80.09, 1);
    expect(lab.b).toBeCloseTo(67.2, 1);
  });
});

describe("color profile", () => {
  it("classifies undertone by skin hue", () => {
    expect(classifyUndertone(42)).toBe("cool");
    expect(classifyUndertone(55)).toBe("neutral");
    expect(classifyUndertone(66)).toBe("warm");
  });
  it("classifies depth by ITA and contrast by ΔL", () => {
    expect(classifyDepth(45)).toBe("light");
    expect(classifyDepth(20)).toBe("medium");
    expect(classifyDepth(-20)).toBe("deep");
    expect(classifyContrast(50)).toBe("high");
    expect(classifyContrast(30)).toBe("medium");
    expect(classifyContrast(12)).toBe("low");
  });
  it("builds a profile with evidence from YouCam colors", () => {
    const p = buildColorProfile({ skin: "#e0b49a", hair: "#2a1d17", eye: "#4a3426" });
    expect(p.skin.hex).toBe("#e0b49a");
    expect(p.contrast).toBe("high");
    expect(p.contrastDeltaL).toBeGreaterThan(40);
    expect(["warm", "neutral", "cool"]).toContain(p.undertone);
  });
  it("lowers confidence without hair/eye colors or with poor lighting", () => {
    const p = buildColorProfile({ skin: "#c99a7c" }, { lighting: "poor" });
    expect(p.confidence).toBe("low");
    expect(p.issues).toContain("no_hair_eye_color");
    expect(p.issues).toContain("poor_lighting");
  });
});

describe("garment color", () => {
  it("names basic colors", () => {
    const name = (hex: string) => {
      const c = hexToLch(hex);
      return colorName(c.L, c.C, c.h);
    };
    expect(name("#000000")).toBe("black");
    expect(name("#ffffff")).toBe("white");
    expect(name("#000080")).toBe("navy");
    expect(name("#1e5bd8")).toBe("blue");
    expect(name("#c8a27a")).toBe("camel");
    expect(name("#cc1f1f")).toBe("red");
    expect(name("#2e8b57")).toBe("green");
  });
  it("describes temperature, value and chroma", () => {
    const camel = describeGarmentColor("#c19a6b");
    expect(camel.temperature).toBe("warm");
    const cobalt = describeGarmentColor("#0047ab");
    expect(cobalt.temperature).toBe("cool");
    expect(cobalt.chroma).toBe("bright");
    const black = describeGarmentColor("#111111");
    expect(black.temperature).toBe("achromatic");
    expect(black.value).toBe("dark");
  });
});

function image(width: number, height: number, paint: (x: number, y: number) => [number, number, number, number]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = paint(x, y);
      const i = (y * width + x) * 4;
      data.set([r, g, b, a], i);
    }
  return data;
}

describe("dominant colors", () => {
  it("ignores a plain background and finds the garment color", () => {
    const data = image(80, 80, (x, y) => (x > 20 && x < 60 && y > 15 && y < 70 ? [30, 60, 140, 255] : [245, 245, 245, 255]));
    const [top] = dominantColors(data, 80, 80);
    expect(deltaE(top.lab, hexToLab("#1e3c8c"))).toBeLessThan(3);
    expect(top.share).toBeGreaterThan(0.9);
  });
  it("uses transparency when the background was removed", () => {
    const data = image(60, 60, (x) => (x < 30 ? [200, 40, 40, 255] : [0, 0, 0, 0]));
    const clusters = dominantColors(data, 60, 60);
    expect(clusters).toHaveLength(1);
    expect(deltaE(clusters[0].lab, hexToLab("#c82828"))).toBeLessThan(3);
  });
  it("flags two-color prints", () => {
    const data = image(60, 60, (x, y) => {
      if (x < 5 || x > 55) return [250, 250, 250, 255];
      return (Math.floor(y / 6) % 2 === 0 ? [20, 20, 20, 255] : [230, 200, 60, 255]) as [number, number, number, number];
    });
    expect(looksMulticolor(dominantColors(data, 60, 60))).toBe(true);
  });
});
