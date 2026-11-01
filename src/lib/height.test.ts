import { describe, expect, it } from "vitest";
import { parseCm } from "./height";

describe("parseCm", () => {
  it("reads centimeters", () => {
    expect(parseCm("165")).toBe(165);
    expect(parseCm(" 172 cm ")).toBe(172);
  });

  it("reads meters, with a dot or a comma", () => {
    expect(parseCm("1.55")).toBe(155);
    expect(parseCm("1,68")).toBe(168);
    expect(parseCm("1.7m")).toBe(170);
  });

  it("leaves what it can't read out of range", () => {
    expect(parseCm("")).toBe(0);
    expect(Number.isNaN(parseCm("abc"))).toBe(true);
    expect(Number.isNaN(parseCm("1.6.5"))).toBe(true);
  });
});
