// Tiny i18n: dictionaries + `translate()` with {param} interpolation. Pure, so it
// works on the server (template verdicts) and in the browser (via the provider).

import { en, type Dictionary } from "./en";
import { es } from "./es";

export type Locale = "en" | "es";
export const LOCALES: Locale[] = ["en", "es"];
export const DICTIONARIES: Record<Locale, Dictionary> = { en, es };

export type Params = Record<string, string | number | undefined>;

function lookup(dict: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((node, part) => {
    if (node && typeof node === "object" && part in (node as Record<string, unknown>)) {
      return (node as Record<string, unknown>)[part];
    }
    return undefined;
  }, dict);
}

export function hasKey(locale: Locale, path: string): boolean {
  return typeof lookup(DICTIONARIES[locale], path) === "string";
}

export function translate(locale: Locale, path: string, params: Params = {}): string {
  const raw = lookup(DICTIONARIES[locale], path) ?? lookup(en, path);
  if (typeof raw !== "string") return path;
  return raw.replace(/\{(\w+)\}/g, (_, name: string) => {
    const v = params[name];
    return v === undefined || v === null ? `{${name}}` : String(v);
  });
}

/** Param keys whose values are themselves translatable codes. */
const LOCALIZED_PARAMS: Record<string, string> = {
  color: "colors",
  undertone: "undertone",
  contrast: "contrast",
  temperature: "temperature",
  goal: "goals",
  name: "lipsticks",
};

export function localizeParams(locale: Locale, params: Params = {}): Params {
  const out: Params = {};
  for (const [k, v] of Object.entries(params)) {
    const ns = LOCALIZED_PARAMS[k];
    out[k] = ns && typeof v === "string" && hasKey(locale, `${ns}.${v}`) ? translate(locale, `${ns}.${v}`) : v;
  }
  return out;
}

export function evidenceText(locale: Locale, code: string, params?: Params): string {
  return translate(locale, `evidence.${code}`, localizeParams(locale, params));
}

export function rescueText(locale: Locale, code: string, params?: Params): string {
  return translate(locale, `rescues.${code}`, localizeParams(locale, params));
}
