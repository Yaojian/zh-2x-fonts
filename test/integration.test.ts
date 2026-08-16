import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { openFont, measureFont } from "../src/measure.ts";

describe("real font fixtures", () => {
  test("fairfax-hax qualifies: contains all CJK glyphs at exactly 2x", () => {
    const font = openFont(readFileSync("fixtures/fairfax-hax.woff2"));
    const r = measureFont(font);
    expect(r.missing).toEqual([]);
    expect(r.en).toBe(r.cn);
    expect(r.qualifies).toBe(true);
  });

  test("sinclair-ql does not qualify: no CJK glyph coverage", () => {
    const font = openFont(readFileSync("fixtures/sinclair-ql.woff2"));
    const r = measureFont(font);
    expect(r.missing.length).toBeGreaterThan(0);
    expect(r.qualifies).toBe(false);
  });
});
