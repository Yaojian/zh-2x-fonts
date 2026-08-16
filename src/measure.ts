// Bun's TextDecoder rejects legacy cmap encodings (e.g. "x-mac-roman") that
// some fonts use, which makes fontkit throw. Falling back to utf-8 keeps the
// Unicode cmap subtables (which carry the CJK mappings) readable.
const OrigTextDecoder = globalThis.TextDecoder;
globalThis.TextDecoder = class extends OrigTextDecoder {
  constructor(label?: string, options?: any) {
    try {
      super(label as any, options);
    } catch {
      super("utf-8", options);
    }
  }
} as typeof TextDecoder;

import * as fontkitNS from "fontkit";
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

const fontkit = (fontkitNS as any).default ?? fontkitNS;

export function openFont(buffer: Uint8Array): Font {
  const font = fontkit.create(buffer);
  return {
    hasGlyph: (cp: number) => font.hasGlyphForCodePoint(cp),
    advance: (cp: number) => font.glyphForCodePoint(cp).advanceWidth,
  };
}
