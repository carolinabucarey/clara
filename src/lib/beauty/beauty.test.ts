import { describe, expect, it } from "vitest";
import { buildColorProfile } from "../color/profile";
import { PARAM_SCHEMAS } from "../youcam/features";
import { readFaceShape } from "../youcam/browser";
import { makeupEffects, makeupFor } from "./makeup";
import { suggestHairstyles, tagTemplate, templatesFor, type HairTemplate } from "./hairstyles";

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

describe("hairstyle suggestions", () => {
  const catalog: HairTemplate[] = [
    { id: "1", title: "Curly Bob", thumb: null, category: "Women" },
    { id: "2", title: "Side-Swept Bangs", thumb: null, category: null },
    { id: "3", title: "Textured Quiff", thumb: null, category: null },
    { id: "4", title: "Long Straight", thumb: null, category: "Female" },
    { id: "5", title: "Buzz Cut", thumb: null, category: "Men" },
    { id: "6", title: "Layered Waves", thumb: null, category: null },
  ];

  it("tags templates from their words", () => {
    expect(tagTemplate(catalog[0])).toMatchObject({ group: "feminine", length: "medium", waves: true });
    expect(tagTemplate(catalog[2])).toMatchObject({ group: "masculine", length: "short", volumeTop: true });
    expect(tagTemplate(catalog[3]).group).toBe("feminine");
    expect(tagTemplate(catalog[4]).group).toBe("masculine");
  });

  it("filters by the style the person chose, never by a guess", () => {
    expect(templatesFor(catalog, "masculine").map((t) => t.id)).toEqual(["2", "3", "5", "6"]);
    expect(templatesFor(catalog, "feminine").map((t) => t.id)).toEqual(["1", "2", "4", "6"]);
    expect(templatesFor(catalog, "all")).toHaveLength(6);
  });

  it("puts fringe and width first for an oblong face", () => {
    const picks = suggestHairstyles(catalog, "oblong", "all");
    expect(picks).toHaveLength(3);
    expect(picks[0].code).toBe("oblong_fringe");
    expect(picks.map((p) => p.templateId)).not.toContain("4");
  });

  it("still suggests something without a face shape", () => {
    const picks = suggestHairstyles(catalog, null, "feminine");
    expect(picks).toHaveLength(3);
    expect(picks[0].code).toBe("no_shape");
  });
});
