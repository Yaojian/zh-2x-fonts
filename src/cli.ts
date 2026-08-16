import { collectFonts } from "./measure.ts";
import { S_ENGLISH, S_CHINESE } from "./fonts.ts";

const args = process.argv.slice(2);
const json = args.includes("--json");
const refresh = args.includes("--refresh");

const results = await collectFonts({ refresh });

if (json) {
  console.log(JSON.stringify(results, null, 2));
} else {
  const qualifying = results.filter((r) => r.qualifies);
  console.log(`QUALIFYING FONTS (${qualifying.length})`);
  console.log("");
  const dist = (d: string | undefined) => (d === "free" ? "FREE" : d === "commercial" ? "COMMERCIAL" : "UNKNOWN");
  const header = ["NAME", "AUTHOR", "DISTRIBUTION", "WEBSITE", "PROGRAMMING FONTS"];
  const rows = qualifying.map((r) => [r.name, r.author, dist(r.distribution), r.website, r.programmingFontsUrl]);
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((row) => row[i]!.length)));
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i]!)).join("  ").trimEnd();
  console.log(line(header));
  for (const row of rows) console.log(line(row));

  const excluded = results.filter((r) => !r.qualifies);
  const byReason: Record<string, number> = {};
  for (const r of excluded) {
    let reason: string;
    if (r.status === "download-failed") reason = "download failed";
    else if (r.status === "parse-error") reason = "parse error";
    else if (r.missing.length > 0) reason = "no CJK glyph coverage";
    else reason = "width not exactly 2x";
    byReason[reason] = (byReason[reason] ?? 0) + 1;
  }
  console.log("");
  console.log(`EXCLUDED (${excluded.length})`);
  for (const [reason, n] of Object.entries(byReason)) console.log(`  ${reason}: ${n}`);

  console.log("");
  console.log("A font qualifies when it contains every char of S_CHINESE and");
  console.log(`width(S_ENGLISH) === width(S_CHINESE).`);
  console.log(`S_ENGLISH = "${S_ENGLISH}"`);
  console.log(`S_CHINESE  = "${S_CHINESE}"`);
}
