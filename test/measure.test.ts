import { describe, expect, test } from "bun:test";
import { measureFont, type Font } from "../src/measure.ts";
import { S_ENGLISH, S_CHINESE } from "../src/fonts.ts";

function fakeFont(advanceFor: (cp: number) => number, covered: Set<number>): Font {
  return {
    hasGlyph: (cp) => covered.has(cp),
    advance: (cp) => advanceFor(cp),
  };
}

const ALL = new Set([...S_ENGLISH, ...S_CHINESE].map((c) => c.codePointAt(0)!));

function twoXFont(): Font {
  // CJK ideographs (>= U+4E00) and 。 are full-width (2), ASCII is half-width (1).
  return fakeFont((cp) => (cp >= 0x4e00 || cp === 0x3002 ? 2 : 1), ALL);
}

describe("measureFont", () => {
  test("qualifies when all glyphs present and widths match", () => {
    const r = measureFont(twoXFont());
    expect(r.en).toBe(20);
    expect(r.cn).toBe(20);
    expect(r.missing).toEqual([]);
    expect(r.qualifies).toBe(true);
  });

  test("does not qualify when a CJK glyph is missing from cmap", () => {
    const seven = "七".codePointAt(0)!;
    const covered = new Set([...ALL].filter((cp) => cp !== seven));
    const r = measureFont(fakeFont((cp) => (cp >= 0x4e00 || cp === 0x3002 ? 2 : 1), covered));
    expect(r.missing).toContain("七");
    expect(r.qualifies).toBe(false);
  });

  test("does not qualify when CJK width is not exactly 2x", () => {
    const r = measureFont(fakeFont((cp) => (cp >= 0x4e00 || cp === 0x3002 ? 1.5 : 1), ALL));
    expect(r.qualifies).toBe(false);
  });

  test("does not qualify when 。 is not full-width", () => {
    const r = measureFont(fakeFont((cp) => (cp === 0x3002 ? 1 : cp >= 0x4e00 ? 2 : 1), ALL));
    expect(r.cn).toBe(19);
    expect(r.qualifies).toBe(false);
  });

  test("does not qualify when nothing is covered", () => {
    const r = measureFont(fakeFont(() => 1, new Set()));
    expect(r.missing.length).toBe(S_CHINESE.length);
    expect(r.qualifies).toBe(false);
  });
});
