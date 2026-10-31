import { describe, expect, it } from "vitest";
import { buildColorProfile } from "../color/profile";
import { PARAM_SCHEMAS } from "../youcam/features";
import { readFaceShape } from "../youcam/browser";
import { makeupEffects, makeupFor } from "./makeup";
import { judgeHairstyle, suggestHairstyles, tagTemplate, templatesFor, type HairTemplate } from "./hairstyles";

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

  it("reads YouCam's real catalog titles and suggests only haircuts", () => {
    const real: HairTemplate[] = [
      { id: "female_messy_bun", title: "Messy Bun", thumb: null, category: "Female" },
      { id: "female_bald", title: "Bald", thumb: null, category: "Female" },
      { id: "all_bow_accents", title: "Bow Accents", thumb: null, category: "Female" },
      { id: "all_wavy_bob_bangs", title: "Wavy Bob With Bangs", thumb: null, category: "Female" },
      { id: "all_face_framing", title: "Face Framing Shag Cut", thumb: null, category: "Female" },
      { id: "female_crewcut", title: "Crewcut", thumb: null, category: "Female" },
      { id: "male_textured_crop", title: "Textured Crop", thumb: null, category: "Male" },
    ];
    expect(tagTemplate(real[0]).cut).toBe(false);
    expect(tagTemplate(real[3])).toMatchObject({ group: "feminine", fringe: true, waves: true, cut: true });
    expect(tagTemplate(real[4]).layers).toBe(true);
    expect(tagTemplate(real[5]).length).toBe("short");
    expect(tagTemplate(real[6])).toMatchObject({ group: "masculine", length: "short", volumeTop: true });
    const picks = suggestHairstyles(real, "oblong", "feminine").map((p) => p.templateId);
    expect(picks).not.toContain("female_messy_bun");
    expect(picks).not.toContain("female_bald");
    expect(picks).not.toContain("all_bow_accents");
    expect(picks[0]).toBe("all_wavy_bob_bangs");
  });

  it("never suggests a template that recolors the hair", () => {
    const real: HairTemplate[] = [
      { id: "all_steel_blonde_bob", title: "Steel Blonde Bob", thumb: null, category: "Female", changesColor: true },
      { id: "all_bobcut", title: "Bobcut", thumb: null, category: "Female", changesColor: false },
      { id: "female_long_straight", title: "Long Straight", thumb: null, category: "Female", changesColor: false },
    ];
    const picks = suggestHairstyles(real, "heart", "feminine").map((p) => p.templateId);
    expect(picks).toEqual(["all_bobcut", "female_long_straight"]);
    expect(templatesFor(real, "feminine")).toHaveLength(3);
  });

  it("says whether any chosen cut flatters the face, with its reasons", () => {
    const cut = (title: string) => ({ title, category: "Female" });
    expect(judgeHairstyle(cut("Wavy Bob With Bangs"), "oblong")).toMatchObject({
      verdict: "flatters",
      evidence: [
        { code: "oblong_fringe", polarity: "plus" },
        { code: "oblong_width", polarity: "plus" },
      ],
    });
    expect(judgeHairstyle(cut("Long Straight"), "oblong")).toMatchObject({
      verdict: "not_flattering",
      evidence: [{ code: "oblong_long_straight", polarity: "minus" }],
    });
    // Ahead on balance but with a catch: it works, with tweaks.
    expect(judgeHairstyle(cut("Long Straight Fringe"), "oblong").verdict).toBe("works_with_tweaks");
    expect(judgeHairstyle(cut("Pixie"), "round")).toMatchObject({
      verdict: "works_with_tweaks",
      evidence: [{ code: "shape_no_effect", polarity: "neutral", params: { shape: "round" } }],
    });
  });

  it("still suggests something without a face shape", () => {
    const picks = suggestHairstyles(catalog, null, "feminine");
    expect(picks).toHaveLength(3);
    expect(picks[0].code).toBe("no_shape");
  });
});
