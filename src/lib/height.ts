// Height as people type it in the centimeters field.

/** Centimeters, also reading meters ("1.65", "1,65 m") since many people write their height that way. NaN when unreadable. */
export function parseCm(text: string): number {
  const value = Number(text.trim().replace(",", ".").replace(/\s*c?m$/i, ""));
  return value > 0 && value < 3 ? Math.round(value * 100) : value;
}
