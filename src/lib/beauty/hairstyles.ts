// Hairstyle suggestions from YouCam's template catalog. The catalog carries only a
// title and a category, so each template is tagged from its words (length, fringe,
// volume, waves…), then scored with face-shape rules that read as goals.

import type { FaceShape, HairStyleGroup, HairSuggestion } from "../types";

export interface HairTemplate {
  id: string;
  title: string;
  thumb: string | null;
  category: string | null;
}

export interface HairTags {
  group: "feminine" | "masculine" | "any";
  length: "short" | "medium" | "long";
  volumeTop: boolean;
  fringe: boolean;
  waves: boolean;
  layers: boolean;
}

const has = (text: string, re: RegExp) => re.test(text);

export function tagTemplate(t: Pick<HairTemplate, "title" | "category">): HairTags {
  const text = `${t.title} ${t.category ?? ""}`.toLowerCase();
  const cat = (t.category ?? "").toLowerCase();
  const masculineWords = /\b(men'?s?|man|male|boys?|fade|buzz|crew ?cut|undercut|pompadour|quiff|slick(ed)?[- ]back|taper(ed)?|ivy league|french crop|caesar|mohawk|faux ?hawk|man bun|beard)\b/;
  const feminineWords = /\b(women'?s?|woman|female|girls?|lady|ladies|bob|lob|pixie|ponytail|braids?|princess|mermaid)\b/;
  // "female" contains "male": read the category first, feminine before masculine.
  const group: HairTags["group"] = /female|women|woman|girl|lady/.test(cat)
    ? "feminine"
    : /\bmale\b|\bmen\b|\bman\b|boy/.test(cat)
      ? "masculine"
      : has(text, masculineWords)
        ? "masculine"
        : has(text, feminineWords)
          ? "feminine"
          : "any";
  const length: HairTags["length"] = has(text, /\b(long|waist|mermaid|rapunzel)\b/)
    ? "long"
    : has(text, /\b(pixie|buzz|crew|fade|undercut|crop(ped)?|short|caesar|pompadour|quiff|taper(ed)?|ivy|mohawk|faux ?hawk)\b/)
      ? "short"
      : "medium";
  return {
    group,
    length,
    volumeTop: has(text, /\b(pompadour|quiff|volume|voluminous|mohawk|faux ?hawk|high|top knot|updo|bouffant)\b/),
    fringe: has(text, /\b(bangs?|fringe|curtain)\b/),
    waves: has(text, /\b(waves?|wavy|curls?|curly|perm|ringlets?|coils?)\b/),
    layers: has(text, /\b(layer(ed|s)?|shag|wolf|feather(ed)?|choppy)\b/),
  };
}

interface Rule {
  code: string;
  points: number;
  when: (t: HairTags) => boolean;
}

/** What each face shape asks of a haircut, as goals. */
const RULES: Record<FaceShape, Rule[]> = {
  oval: [
    { code: "oval_versatile", points: 1, when: () => true },
    { code: "oval_show_face", points: 0.5, when: (t) => !t.fringe },
  ],
  round: [
    { code: "round_height", points: 1.5, when: (t) => t.volumeTop },
    { code: "round_length", points: 1, when: (t) => t.length !== "short" },
    { code: "round_layers", points: 0.5, when: (t) => t.layers },
    { code: "round_blunt_fringe", points: -0.75, when: (t) => t.fringe && !t.layers },
  ],
  square: [
    { code: "square_soft_waves", points: 1.5, when: (t) => t.waves },
    { code: "square_layers", points: 1, when: (t) => t.layers },
    { code: "square_side_fringe", points: 0.5, when: (t) => t.fringe },
    { code: "square_blunt_short", points: -0.5, when: (t) => t.length === "short" && !t.waves && !t.layers },
  ],
  oblong: [
    { code: "oblong_fringe", points: 1.5, when: (t) => t.fringe },
    { code: "oblong_width", points: 1, when: (t) => t.waves || t.layers },
    { code: "oblong_long_straight", points: -1, when: (t) => t.length === "long" && !t.waves },
    { code: "oblong_height", points: -1, when: (t) => t.volumeTop },
  ],
  heart: [
    { code: "heart_chin_volume", points: 1.5, when: (t) => t.length === "medium" },
    { code: "heart_fringe", points: 0.5, when: (t) => t.fringe },
    { code: "heart_height", points: -0.5, when: (t) => t.volumeTop },
  ],
  inv_triangle: [
    { code: "heart_chin_volume", points: 1.5, when: (t) => t.length === "medium" },
    { code: "heart_fringe", points: 0.5, when: (t) => t.fringe },
    { code: "heart_height", points: -0.5, when: (t) => t.volumeTop },
  ],
  diamond: [
    { code: "diamond_fringe", points: 1, when: (t) => t.fringe },
    { code: "diamond_chin_length", points: 0.75, when: (t) => t.length === "medium" },
    { code: "diamond_layers", points: 0.5, when: (t) => t.layers },
  ],
  triangle: [
    { code: "triangle_height", points: 1.5, when: (t) => t.volumeTop },
    { code: "triangle_layers", points: 0.5, when: (t) => t.layers },
    { code: "triangle_short_top", points: 0.5, when: (t) => t.length === "short" },
  ],
};

export function matchesGroup(tags: HairTags, group: HairStyleGroup): boolean {
  return group === "all" || tags.group === "any" || tags.group === group;
}

/** Templates visible for the person's chosen style group. */
export function templatesFor(templates: HairTemplate[], group: HairStyleGroup): HairTemplate[] {
  return templates.filter((t) => matchesGroup(tagTemplate(t), group));
}

/** The best `n` templates for this face shape, each with the rule that earned its place. */
export function suggestHairstyles(
  templates: HairTemplate[],
  faceShape: FaceShape | null,
  group: HairStyleGroup,
  n = 3,
): HairSuggestion[] {
  const rules = faceShape ? RULES[faceShape] : [];
  const scored = templatesFor(templates, group).map((t, i) => {
    const tags = tagTemplate(t);
    let score = 0;
    let best: Rule | null = null;
    for (const r of rules) {
      if (!r.when(tags)) continue;
      score += r.points;
      if (r.points > 0 && (!best || r.points > best.points)) best = r;
    }
    return { t, tags, score, best, i };
  });
  scored.sort((a, b) => b.score - a.score || a.i - b.i);

  // Prefer variety: no two picks with the same length and fringe when there are alternatives.
  const picks: typeof scored = [];
  const seen = new Set<string>();
  for (const s of scored) {
    const kind = `${s.tags.length}:${s.tags.fringe}:${s.tags.waves}`;
    if (seen.has(kind)) continue;
    seen.add(kind);
    picks.push(s);
    if (picks.length === n) break;
  }
  for (const s of scored) {
    if (picks.length >= n) break;
    if (!picks.includes(s)) picks.push(s);
  }

  return picks.map(({ t, best }) => ({
    templateId: t.id,
    title: t.title,
    thumb: t.thumb,
    code: best?.code ?? (faceShape ? "shape_neutral" : "no_shape"),
    params: faceShape ? { shape: faceShape } : undefined,
  }));
}
