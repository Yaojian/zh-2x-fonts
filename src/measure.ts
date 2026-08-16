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

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createDownloader, type RawFontEntry } from "./download.ts";
import { loadKnownFonts, type Distribution } from "./known-fonts.ts";
import {
  DEFAULT_CACHE_DIR,
  DEFAULT_CONCURRENCY,
  KNOWN_FONTS_DIR,
  SOURCE_BASE_URL,
} from "./fonts.ts";

export type FontStatus = "ok" | "download-failed" | "parse-error";

export interface FontResult extends MeasureResult {
  alias: string;
  name: string;
  author: string;
  website: string;
  license: string;
  distribution: Distribution;
  status: FontStatus;
  programmingFontsUrl: string;
  woff2Url: string;
}

export interface CollectOptions {
  cacheDir?: string;
  refresh?: boolean;
  retries?: number;
  concurrency?: number;
  source?: string;
  fallbackSource?: string;
  knownFontsDir?: string;
}

export async function collectFonts(options: CollectOptions = {}): Promise<FontResult[]> {
  const cacheDir = options.cacheDir ?? process.env.ZHF_CACHE_DIR ?? DEFAULT_CACHE_DIR;
  const refresh = options.refresh ?? false;
  const concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY);
  const source = options.source ?? process.env.ZHF_SOURCE_URL ?? SOURCE_BASE_URL;
  const knownFontsDir = options.knownFontsDir ?? KNOWN_FONTS_DIR;
  const downloader = createDownloader({
    cacheDir,
    retries: options.retries,
    source: options.source,
    fallbackSource: options.fallbackSource,
  });
  mkdirSync(cacheDir, { recursive: true });

  const resultsPath = join(cacheDir, "results.json");
  const fontsJsonPath = join(cacheDir, "fonts.json");
  if (!refresh && existsSync(resultsPath) && existsSync(fontsJsonPath)) {
    return JSON.parse(readFileSync(resultsPath, "utf8")) as FontResult[];
  }

  const fontsJson = await downloader.fontsJson(refresh);
  const known = loadKnownFonts(knownFontsDir);

  const aliases = Object.keys(fontsJson);
  const results: FontResult[] = new Array(aliases.length);
  let next = 0;

  const measureOne = async (alias: string): Promise<FontResult> => {
    const meta = fontsJson[alias] ?? {};
    const base: Pick<
      FontResult,
      | "alias"
      | "name"
      | "author"
      | "website"
      | "license"
      | "distribution"
      | "programmingFontsUrl"
      | "woff2Url"
    > = {
      alias,
      name: String(meta.name ?? alias),
      author: String(meta.author ?? ""),
      website: String(meta.website ?? ""),
      license: String(meta.license ?? "unknown"),
      distribution: known[alias]?.distribution ?? "unknown",
      programmingFontsUrl: `https://www.programmingfonts.org/#${alias}`,
      woff2Url: `${source}/fonts/resources/${alias}/${alias}.woff2`,
    };
    const buffer = await downloader.woff2(alias, refresh);
    if (!buffer) {
      return { ...base, en: 0, cn: 0, missing: [], qualifies: false, status: "download-failed" };
    }
    try {
      const m = measureFont(openFont(buffer));
      return { ...base, ...m, status: "ok" };
    } catch {
      return { ...base, en: 0, cn: 0, missing: [], qualifies: false, status: "parse-error" };
    }
  };

  const workers = Array.from({ length: concurrency }, async () => {
    while (true) {
      const idx = next++;
      if (idx >= aliases.length) return;
      results[idx] = await measureOne(aliases[idx]!);
    }
  });
  await Promise.all(workers);

  writeFileSync(resultsPath, JSON.stringify(results));
  return results;
}
