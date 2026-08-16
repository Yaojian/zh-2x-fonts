import { S_ENGLISH, S_CHINESE } from "./fonts.ts";

export interface Font {
  hasGlyph(cp: number): boolean;
  advance(cp: number): number;
}

export interface MeasureResult {
  en: number;
  cn: number;
  missing: string[];
  qualifies: boolean;
}

export function measureFont(
  f: Font,
  enText: string = S_ENGLISH,
  cnText: string = S_CHINESE,
): MeasureResult {
  const missing = [...cnText].filter((c) => !f.hasGlyph(c.codePointAt(0)!));
  let en = 0;
  for (const c of enText) en += f.advance(c.codePointAt(0)!);
  let cn = 0;
  for (const c of cnText) cn += f.advance(c.codePointAt(0)!);
  return { en, cn, missing, qualifies: missing.length === 0 && en === cn };
}
