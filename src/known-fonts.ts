import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createDownloader, type RawFontEntry } from "./download.ts";
import { KNOWN_FONTS_DIR, KNOWN_FONTS_OVERRIDES_FILE, SOURCE_BASE_URL } from "./fonts.ts";

export type Distribution = "free" | "commercial" | "unknown";

export interface KnownFont {
  name: string;
  license: string;
  distribution: "free" | "commercial";
  source: string;
}

const REDISTRIBUTABLE_LICENSES = new Set([
  "SIL OFL",
  "MIT",
  "Apache",
  "BSD-2-Clause",
  "GNU GPL",
  "public domain",
  "WTFPL",
  "GUST font license",
  "Luxi License",
  "Ubuntu Font Licence",
  "permissive",
  "CC BY-SA 4.0",
  "CC BY-SA 3.0",
  "Bitstream Vera",
]);

export function classifyLicense(license: string): "free" | "commercial" {
  return REDISTRIBUTABLE_LICENSES.has(license) ? "free" : "commercial";
}

export function loadKnownFonts(dir: string = KNOWN_FONTS_DIR): Record<string, KnownFont> {
  const result: Record<string, KnownFont> = {};
  if (!existsSync(dir)) return result;
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    const alias = file.slice(0, -".json".length);
    result[alias] = JSON.parse(readFileSync(join(dir, file), "utf8")) as KnownFont;
  }
  return result;
}

export interface GenerateKnownFontsOptions {
  cacheDir?: string;
  source?: string;
  fallbackSource?: string;
  dir?: string;
  overridesFile?: string;
}

export async function generateKnownFonts(options: GenerateKnownFontsOptions = {}): Promise<number> {
  const downloader = createDownloader({
    cacheDir: options.cacheDir,
    source: options.source,
    fallbackSource: options.fallbackSource,
  });
  const fontsJson = await downloader.fontsJson();

  const dir = options.dir ?? KNOWN_FONTS_DIR;
  mkdirSync(dir, { recursive: true });

  const overridesPath = options.overridesFile ?? KNOWN_FONTS_OVERRIDES_FILE;
  const overrides: Record<string, "free" | "commercial"> = existsSync(overridesPath)
    ? (JSON.parse(readFileSync(overridesPath, "utf8")) as Record<string, "free" | "commercial">)
    : {};

  const source = options.source ?? process.env.ZHF_SOURCE_URL ?? SOURCE_BASE_URL;

  let count = 0;
  for (const alias of Object.keys(fontsJson)) {
    const meta = fontsJson[alias] ?? {};
    const license = String(meta.license ?? "unknown");
    const entry: KnownFont = {
      name: String(meta.name ?? alias),
      license,
      distribution: overrides[alias] ?? classifyLicense(license),
      source: `${source}/fonts/resources/${alias}/${alias}.woff2`,
    };
    writeFileSync(join(dir, `${alias}.json`), JSON.stringify(entry, null, 2) + "\n");
    count++;
  }
  return count;
}

if (import.meta.main) {
  const count = await generateKnownFonts();
  console.log(`wrote ${count} known-font files to ${KNOWN_FONTS_DIR}`);
}
