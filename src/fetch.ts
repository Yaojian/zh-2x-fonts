import { createDownloader } from "./download.ts";
import { DEFAULT_CONCURRENCY } from "./fonts.ts";

const args = process.argv.slice(2);
const refresh = args.includes("--refresh");
const concurrency = Math.max(1, DEFAULT_CONCURRENCY);

const downloader = createDownloader({});
const fontsJson = await downloader.fontsJson(refresh);
const aliases = Object.keys(fontsJson);

console.log(`downloading ${aliases.length} fonts...`);
let next = 0;
let ok = 0;
let failed = 0;
const failures: string[] = [];

const worker = async () => {
  while (true) {
    const idx = next++;
    if (idx >= aliases.length) return;
    const alias = aliases[idx]!;
    const buffer = await downloader.woff2(alias, refresh);
    if (buffer) {
      ok++;
    } else {
      failed++;
      failures.push(alias);
    }
    if ((idx + 1) % 20 === 0 || idx + 1 === aliases.length) {
      console.log(`  ${idx + 1}/${aliases.length} (ok ${ok}, failed ${failed})`);
    }
  }
};

await Promise.all(Array.from({ length: concurrency }, worker));

console.log(`done: ${ok} downloaded, ${failed} failed`);
if (failures.length > 0) {
  console.log("failed: " + failures.join(", "));
}
