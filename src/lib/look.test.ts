import { describe, expect, it } from "vitest";
import { fullLookUrl, missingSlots, outfitKey, outfitPlan, placePiece, tryOnBaseFor, wearOrder, type TryOnState } from "./look";
import type { GarmentCategory } from "./types";

const trial = (id: string, category: GarmentCategory, tryOnUrl?: string, tryOnOverUrl?: string): TryOnState => ({
  garment: { id, attrs: { category } },
  tryOnUrl,
  tryOnOverUrl,
});

describe("look pieces", () => {
  it("a dress replaces top and bottom, and a top replaces a dress", () => {
    expect(placePiece({ top: 0, bottom: 1 }, "full", 2)).toEqual({ full: 2 });
    expect(placePiece({ full: 2, outer: 3 }, "top", 4)).toEqual({ top: 4, outer: 3 });
  });

  it("moves a piece when its category changes", () => {
    expect(placePiece({ top: 0, bottom: 1 }, "outer", 0)).toEqual({ bottom: 1, outer: 0 });
  });

  it("wears base pieces first and the layer last", () => {
    expect(wearOrder({ outer: 2, bottom: 1, top: 0 })).toEqual(["top", "bottom", "outer"]);
  });

  it("offers what is missing", () => {
    expect(missingSlots({ top: 0 })).toEqual(["bottom", "outer"]);
    expect(missingSlots({ full: 0 })).toEqual(["outer"]);
    expect(missingSlots({ top: 0, bottom: 1, outer: 2 })).toEqual([]);
  });
});

describe("outfit plan", () => {
  it("reuses a piece tried on over the other one", () => {
    const trials = [trial("a", "upper_body", "u:top"), trial("b", "lower_body", "u:both", "u:top")];
    expect(outfitPlan({ top: 0, bottom: 1 }, trials)).toEqual({ baseUrl: "u:both", steps: [] });
  });

  it("starts from any single try-on and applies the rest in wear order", () => {
    const trials = [trial("a", "upper_body"), trial("b", "lower_body", "u:bottom"), trial("c", "outer")];
    expect(outfitPlan({ top: 0, bottom: 1, outer: 2 }, trials)).toEqual({ baseUrl: "u:bottom", steps: ["top", "outer"] });
  });

  it("starts from the body photo when nothing was tried on yet", () => {
    const trials = [trial("a", "upper_body"), trial("b", "lower_body")];
    expect(outfitPlan({ top: 0, bottom: 1 }, trials)).toEqual({ baseUrl: null, steps: ["top", "bottom"] });
  });

  it("the key changes with pieces, categories and the body photo", () => {
    const trials = [trial("a", "upper_body"), trial("b", "lower_body")];
    const k = outfitKey({ top: 0, bottom: 1 }, trials, "body1");
    expect(outfitKey({ top: 0 }, trials, "body1")).not.toBe(k);
    expect(outfitKey({ top: 0, bottom: 1 }, trials, "body2")).not.toBe(k);
  });
});

describe("try-on base for a piece's own verdict", () => {
  it("a complement is tried on over the other piece", () => {
    const trials = [trial("a", "upper_body", "u:top"), trial("b", "lower_body")];
    expect(tryOnBaseFor({ top: 0, bottom: 1 }, trials, 1)).toBe("u:top");
  });

  it("never over a result that already contains the piece", () => {
    const trials = [trial("a", "upper_body", "u:top"), trial("b", "lower_body", "u:both", "u:top")];
    expect(tryOnBaseFor({ top: 0, bottom: 1 }, trials, 0)).toBeUndefined();
  });

  it("nothing for a piece alone", () => {
    expect(tryOnBaseFor({ top: 0 }, [trial("a", "upper_body", "u:top")], 0)).toBeUndefined();
  });
});

describe("full look", () => {
  const look = { fullUrl: "u:full", fullKey: 'u:outfit|[{"category":"lip_color"}]' };

  it("keeps the makeup made on this outfit", () => {
    expect(fullLookUrl(look, "u:outfit")).toBe("u:full");
  });

  it("drops it once the outfit changes", () => {
    expect(fullLookUrl(look, "u:outfit2")).toBeUndefined();
    expect(fullLookUrl(look, null)).toBeUndefined();
  });
});
