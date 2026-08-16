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
import {
  DEFAULT_CACHE_DIR,
  DEFAULT_CONCURRENCY,
  DEFAULT_RETRIES,
  FALLBACK_BASE_URL,
  SOURCE_BASE_URL,
} from "./fonts.ts";

export type FontStatus = "ok" | "download-failed" | "parse-error";

export interface FontResult extends MeasureResult {
  alias: string;
  name: string;
  author: string;
  website: string;
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
}

interface RawFontEntry {
  name?: unknown;
  author?: unknown;
  website?: unknown;
}

async function fetchWithFallback(urls: string[], retries: number): Promise<Response> {
  for (const url of urls) {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
        if (res.ok) return res;
        if (res.status === 404) break;
      } catch {
        // network error, retry
      }
    }
  }
  throw new Error("all download sources failed");
}

export async function collectFonts(options: CollectOptions = {}): Promise<FontResult[]> {
  const cacheDir = options.cacheDir ?? process.env.ZHF_CACHE_DIR ?? DEFAULT_CACHE_DIR;
  const refresh = options.refresh ?? false;
  const retries = options.retries ?? DEFAULT_RETRIES;
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const source = options.source ?? process.env.ZHF_SOURCE_URL ?? SOURCE_BASE_URL;
  const fallbackSource = options.fallbackSource ?? process.env.ZHF_FALLBACK_URL ?? FALLBACK_BASE_URL;
  mkdirSync(cacheDir, { recursive: true });

  const resultsPath = join(cacheDir, "results.json");
  const fontsJsonPath = join(cacheDir, "fonts.json");
  if (!refresh && existsSync(resultsPath) && existsSync(fontsJsonPath)) {
    return JSON.parse(readFileSync(resultsPath, "utf8")) as FontResult[];
  }

  let fontsJson: Record<string, RawFontEntry>;
  if (!refresh && existsSync(fontsJsonPath)) {
    fontsJson = JSON.parse(readFileSync(fontsJsonPath, "utf8"));
  } else {
    const res = await fetchWithFallback(
      [`${source}/fonts.json`, `${fallbackSource}/fonts.json`],
      retries,
    );
    fontsJson = (await res.json()) as Record<string, RawFontEntry>;
    writeFileSync(fontsJsonPath, JSON.stringify(fontsJson));
  }

  const cachedWoff2 = async (alias: string): Promise<Uint8Array | null> => {
    const path = join(cacheDir, `${alias}.woff2`);
    if (!refresh && existsSync(path)) return readFileSync(path);
    try {
      const res = await fetchWithFallback(
        [
          `${source}/fonts/resources/${alias}/${alias}.woff2`,
          `${fallbackSource}/fonts/resources/${alias}/${alias}.woff2`,
        ],
        retries,
      );
      const bytes = new Uint8Array(await res.arrayBuffer());
      writeFileSync(path, bytes);
      return bytes;
    } catch {
      return null;
    }
  };

  const aliases = Object.keys(fontsJson);
  const results: FontResult[] = new Array(aliases.length);
  let next = 0;

  const measureOne = async (alias: string): Promise<FontResult> => {
    const meta = fontsJson[alias] ?? {};
    const base = {
      alias,
      name: String(meta.name ?? alias),
      author: String(meta.author ?? ""),
      website: String(meta.website ?? ""),
      programmingFontsUrl: `https://www.programmingfonts.org/#${alias}`,
      woff2Url: `${source}/fonts/resources/${alias}/${alias}.woff2`,
    };
    const buffer = await cachedWoff2(alias);
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
