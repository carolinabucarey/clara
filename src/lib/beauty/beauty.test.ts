import { describe, expect, it } from "vitest";
import { buildColorProfile } from "../color/profile";
import { deltaE, hexToLab } from "../color/lab";
import { hasKey } from "../i18n";
import { hairColorParams, PARAM_SCHEMAS } from "../youcam/features";
import { readFaceShape } from "../youcam/browser";
import { makeupEffects, makeupFor, makeupShades, shadeOf } from "./makeup";
import { hairColorsFor } from "./haircolor";

const warm = buildColorProfile({ skin: "#d9a98a", hair: "#3b2a20", eye: "#4a3426" });

describe("makeup suggestion", () => {
  it("covers blush, eyes, liner and lips, in the person's undertone", () => {
    const steps = makeupFor(warm, "round", ["#1f2a44"]);
    expect(steps.map((s) => s.category)).toEqual(["blush", "eye_shadow", "eye_liner", "lip_color"]);
    expect(steps[0].code).toBe("blush_shape");
    expect(steps[0].pattern).toBe("1color2");
    expect(steps.every((s) => s.colors.every((c) => /^#[0-9a-f]{6}$/i.test(c)))).toBe(true);
  });

  it("lets a colorful outfit lead and adds depth to the eyes with neutral clothes", () => {
    expect(makeupFor(warm, null, ["#c2185b"])[1].code).toBe("eyes_let_color_lead");
    const neutral = makeupFor(warm, null, ["#111111"])[1];
    expect(neutral.code).toBe("eyes_depth_with_neutrals");
    expect(neutral.intensity).toBeGreaterThan(makeupFor(warm, null, ["#c2185b"])[1].intensity);
  });

  it("builds effects YouCam accepts", () => {
    const params = { effects: makeupEffects(makeupFor(warm, "oval", [])), version: "1.0" };
    expect(PARAM_SCHEMAS["makeup-vto"].safeParse(params).success).toBe(true);
  });

  it("offers Clara's shade first, then others to try, each named in both languages", () => {
    const shades = makeupShades(warm);
    for (const step of makeupFor(warm, null, [])) {
      const options = shades[step.category];
      expect(options[0].colors).toEqual(step.colors);
      expect(options.length).toBeGreaterThan(2);
      expect(new Set(options.map((o) => o.name)).size).toBe(options.length);
      const ns = step.category === "lip_color" ? "lipsticks" : "shades";
      for (const o of options) expect(hasKey("es", `${ns}.${o.name}`) && hasKey("en", `${ns}.${o.name}`)).toBe(true);
    }
  });

  it("swaps in the shades the person picked, keeping Clara's intensity and placement", () => {
    const clara = makeupFor(warm, "round", []);
    const picked = makeupFor(warm, "round", [], { lip_color: "wine", eye_shadow: "smoky", blush: "not_a_shade" });
    const wine = makeupShades(warm).lip_color.find((o) => o.name === "wine")!;
    expect(picked[3]).toMatchObject({ code: "lip_try", colors: wine.colors, intensity: clara[3].intensity });
    expect(shadeOf(picked[3])).toBe("wine");
    expect(picked[1]).toMatchObject({ code: "eyes_try", pattern: clara[1].pattern, intensity: clara[1].intensity });
    expect(picked[1].colors).toHaveLength(2);
    expect(picked[0]).toEqual(clara[0]);
    // Picking Clara's own shade is the same as not picking.
    expect(makeupFor(warm, "round", [], Object.fromEntries(clara.map((s) => [s.category, shadeOf(s)])))).toEqual(clara);
    expect(PARAM_SCHEMAS["makeup-vto"].safeParse({ effects: makeupEffects(picked), version: "1.0" }).success).toBe(true);
  });
});

describe("face shape reading", () => {
  it("reads the shape and the width/height ratio wherever YouCam nests them", () => {
    expect(readFaceShape({ faceshape: "InvTriangle", facialratio: { face_aspect_ratio: [1, 1.46] } })).toEqual({
      shape: "inv_triangle",
      aspect: 0.68,
    });
    expect(readFaceShape({ face_attribute: { faceshape: "Oval" } })).toEqual({ shape: "oval", aspect: null });
    expect(readFaceShape({ faceshape: "Unknown" })).toBeNull();
  });
});

describe("hair color suggestions", () => {
  const shades = (colors: Parameters<typeof buildColorProfile>[0]) => hairColorsFor(buildColorProfile(colors));

  it("stays in the person's undertone and close to the depth of their hair", () => {
    const cool = buildColorProfile({ skin: "#f1d3cf", hair: "#2a2220", eye: "#3a3a40" });
    expect(cool.undertone).toBe("cool");
    const picks = hairColorsFor(cool);
    expect(picks).toHaveLength(3);
    expect(picks.every((c) => c.code === "cool")).toBe(true);
    expect(picks.every((c) => Math.abs(hexToLab(c.hex).L - cool.hair!.L) < 20)).toBe(true);
  });

  it("offers blondes to a blonde, never the color they already have", () => {
    const blonde = buildColorProfile({ skin: "#f3d9d3", hair: "#b8a080", eye: "#6a8090" });
    const picks = hairColorsFor(blonde);
    expect(picks.map((c) => c.params.shade)).toEqual(expect.arrayContaining(["platinum", "dark_ash_blonde"]));
    expect(picks.every((c) => deltaE(hexToLab(c.hex), blonde.hair!) >= 8)).toBe(true);
  });

  it("aims by the skin's depth when the hair could not be read", () => {
    const picks = shades({ skin: "#8d5a3e" });
    expect(picks).toHaveLength(3);
    expect(picks.every((c) => hexToLab(c.hex).L < 40)).toBe(true);
  });

  it("names every shade in both languages and builds params YouCam accepts", () => {
    for (const skin of ["#d9a98a", "#f1d3cf", "#e8c4a8", "#8d5a3e"]) {
      for (const c of shades({ skin, hair: "#5a4030" })) {
        expect(hasKey("es", `shades.${c.params.shade}`) && hasKey("en", `shades.${c.params.shade}`)).toBe(true);
        expect(hasKey("es", `beauty.hairWhy.${c.code}`) && hasKey("en", `beauty.hairWhy.${c.code}`)).toBe(true);
        expect(PARAM_SCHEMAS["hair-color"].safeParse(hairColorParams(c.hex)).success).toBe(true);
      }
    }
  });
});
