import { describe, expect, it } from "vitest";
import { computeStageRect, parseAspect, parseDimension, pixelRatioFor, requestedRenderSize, shouldPreventKey } from "@/game/display";

describe("parseDimension", () => {
  it("accepts any positive finite value without arbitrary clamps", () => {
    expect(parseDimension("1100")).toBe(1100);
    expect(parseDimension(20000)).toBe(20000);
    expect(parseDimension("0.5")).toBe(0.5);
  });
  it("rejects invalid input", () => {
    for (const v of ["", " ", "abc", 0, -5, NaN, Infinity, "Infinity", null, undefined, 2 ** 60]) {
      expect(parseDimension(v)).toBeNull();
    }
  });
});

describe("parseAspect", () => {
  it("parses ratios", () => {
    expect(parseAspect("16:9")?.ratio).toBeCloseTo(16 / 9);
    expect(parseAspect("2.39:1")?.ratio).toBeCloseTo(2.39);
  });
  it("rejects bad ratios", () => {
    expect(parseAspect("0:9")).toBeNull();
    expect(parseAspect("16")).toBeNull();
    expect(parseAspect("a:b")).toBeNull();
  });
});

describe("computeStageRect", () => {
  it("stretch fills the container", () => {
    expect(computeStageRect(1000, 500, 4 / 3, "stretch")).toEqual({ x: 0, y: 0, w: 1000, h: 500 });
  });
  it("blackbars pillarboxes a narrower aspect", () => {
    const r = computeStageRect(1600, 900, 4 / 3, "blackbars");
    expect(r.h).toBe(900);
    expect(r.w).toBe(1200);
    expect(r.x).toBe(200);
  });
  it("cover crops to fill", () => {
    const r = computeStageRect(1600, 900, 4 / 3, "cover");
    expect(r.w).toBe(1600);
    expect(r.h).toBe(1200);
    expect(r.y).toBe(-150);
  });
});

describe("render size and DPR", () => {
  it("uses requested internal resolution unless native", () => {
    const stage = { x: 0, y: 0, w: 800, h: 600 };
    expect(requestedRenderSize("stretch", { w: 1100, h: 1080 }, stage)).toEqual({ w: 1100, h: 1080 });
    expect(requestedRenderSize("native", { w: 1100, h: 1080 }, stage)).toEqual({ w: 800, h: 600 });
  });
  it("caps pixel ratio by quality", () => {
    expect(pixelRatioFor("low", 2, true)).toBe(0.75);
    expect(pixelRatioFor("high", 3, true)).toBe(1.25);
    expect(pixelRatioFor("high", 3, false)).toBe(1);
  });
});

describe("shouldPreventKey", () => {
  const ev = (code: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}) => ({
    code, ctrlKey: false, metaKey: false, altKey: false, ...mods,
  });
  it("prevents game keys", () => {
    expect(shouldPreventKey(ev("KeyW"))).toBe(true);
    expect(shouldPreventKey(ev("ControlLeft", { ctrlKey: true }))).toBe(true);
  });
  it("never blocks browser shortcuts", () => {
    expect(shouldPreventKey(ev("KeyW", { ctrlKey: true }))).toBe(false);
    expect(shouldPreventKey(ev("KeyL", { ctrlKey: true }))).toBe(false);
    expect(shouldPreventKey(ev("F4", { altKey: true }))).toBe(false);
    expect(shouldPreventKey(ev("Tab"))).toBe(false);
  });
});
