import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_CACHE_DIR,
  DEFAULT_RETRIES,
  DEFAULT_TIMEOUT_MS,
  FALLBACK_BASE_URL,
  SOURCE_BASE_URL,
} from "./fonts.ts";

export interface RawFontEntry {
  name?: unknown;
  author?: unknown;
  website?: unknown;
  license?: unknown;
  [key: string]: unknown;
}

export interface DownloaderOptions {
  cacheDir?: string;
  retries?: number;
  source?: string;
  fallbackSource?: string;
}

export interface Downloader {
  fontsJson(refresh?: boolean): Promise<Record<string, RawFontEntry>>;
  woff2(alias: string, refresh?: boolean): Promise<Uint8Array | null>;
}

async function fetchWithFallback(urls: string[], retries: number): Promise<Response> {
  for (const url of urls) {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS) });
        if (res.ok) return res;
        if (res.status === 404) break;
      } catch {}
    }
  }
  throw new Error("all download sources failed");
}

export function createDownloader(options: DownloaderOptions = {}): Downloader {
  const cacheDir = options.cacheDir ?? process.env.ZHF_CACHE_DIR ?? DEFAULT_CACHE_DIR;
  const retries = options.retries ?? DEFAULT_RETRIES;
  const source = options.source ?? process.env.ZHF_SOURCE_URL ?? SOURCE_BASE_URL;
  const fallbackSource = options.fallbackSource ?? process.env.ZHF_FALLBACK_URL ?? FALLBACK_BASE_URL;
  mkdirSync(cacheDir, { recursive: true });

  const fontsJsonPath = join(cacheDir, "fonts.json");

  const fontsJson = async (refresh: boolean = false): Promise<Record<string, RawFontEntry>> => {
    if (!refresh && existsSync(fontsJsonPath)) {
      return JSON.parse(readFileSync(fontsJsonPath, "utf8")) as Record<string, RawFontEntry>;
    }
    const res = await fetchWithFallback([`${source}/fonts.json`, `${fallbackSource}/fonts.json`], retries);
    const data = (await res.json()) as Record<string, RawFontEntry>;
    writeFileSync(fontsJsonPath, JSON.stringify(data));
    return data;
  };

  const woff2 = async (alias: string, refresh: boolean = false): Promise<Uint8Array | null> => {
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

  return { fontsJson, woff2 };
}
