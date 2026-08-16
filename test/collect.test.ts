import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectFonts } from "../src/measure.ts";

const fontsJson = {
  "fairfax-hax": { name: "Fairfax Hax", author: "Kreative Korporation", website: "https://example.org/fairfax" },
  "sinclair-ql": { name: "Sinclair QL", author: "Damien Guard", website: "https://example.org/sinclair" },
  monolisa: { name: "MonoLisa", author: "Monolisa", website: "https://example.org/monolisa" },
};

let server: ReturnType<typeof Bun.serve>;
let requests = 0;
let knownDir: string;
const failOnce = new Set<string>();

beforeAll(async () => {
  knownDir = mkdtempSync(join(tmpdir(), "zhf-known-"));
  server = Bun.serve({
    port: 0,
    async fetch(req) {
      requests++;
      const url = new URL(req.url);
      if (url.pathname === "/fonts.json") return Response.json(fontsJson);
      const m = url.pathname.match(/^\/fonts\/resources\/([^/]+)\/\1\.woff2$/);
      if (m) {
        const alias = m[1]!;
        if (failOnce.has(alias)) {
          failOnce.delete(alias);
          return new Response("slow", { status: 500 });
        }
        const f = Bun.file(`fixtures/${alias}.woff2`);
        if (await f.exists()) return new Response(f);
        return new Response("missing", { status: 404 });
      }
      return new Response("not found", { status: 404 });
    },
  });
});

afterAll(() => {
  server.stop();
  rmSync(knownDir, { recursive: true, force: true });
});

const opts = () => ({
  source: `http://localhost:${server.port}`,
  fallbackSource: `http://localhost:${server.port}`,
  retries: 2,
  knownFontsDir: knownDir,
});

function tempCache(): string {
  return mkdtempSync(join(tmpdir(), "zhf-test-"));
}

describe("collectFonts", () => {
  test("measures every font and reports status", async () => {
    const cacheDir = tempCache();
    try {
      const results = await collectFonts({ ...opts(), cacheDir });
      const byAlias = Object.fromEntries(results.map((r) => [r.alias, r]));
      expect(Object.keys(byAlias).sort()).toEqual(["fairfax-hax", "monolisa", "sinclair-ql"]);
      expect(byAlias["fairfax-hax"]!.qualifies).toBe(true);
      expect(byAlias["fairfax-hax"]!.status).toBe("ok");
      expect(byAlias["sinclair-ql"]!.qualifies).toBe(false);
      expect(byAlias["sinclair-ql"]!.status).toBe("ok");
      expect(byAlias["monolisa"]!.status).toBe("download-failed");
      expect(byAlias["monolisa"]!.programmingFontsUrl).toBe("https://www.programmingfonts.org/#monolisa");
      expect(byAlias["fairfax-hax"]!.license).toBe("unknown");
      expect(byAlias["fairfax-hax"]!.distribution).toBe("unknown");
    } finally {
      rmSync(cacheDir, { recursive: true, force: true });
    }
  });

  test("annotates distribution from known-fonts files", async () => {
    const cacheDir = tempCache();
    const known = mkdtempSync(join(tmpdir(), "zhf-known-"));
    try {
      mkdirSync(known, { recursive: true });
      writeFileSync(
        join(known, "fairfax-hax.json"),
        JSON.stringify({ name: "Fairfax Hax", license: "SIL OFL", distribution: "free", source: "https://x" }),
      );
      const results = await collectFonts({ ...opts(), cacheDir, knownFontsDir: known });
      const byAlias = Object.fromEntries(results.map((r) => [r.alias, r]));
      expect(byAlias["fairfax-hax"]!.distribution).toBe("free");
      expect(byAlias["sinclair-ql"]!.distribution).toBe("unknown");
    } finally {
      rmSync(cacheDir, { recursive: true, force: true });
      rmSync(known, { recursive: true, force: true });
    }
  });

  test("second call uses cache and makes zero network requests", async () => {
    const cacheDir = tempCache();
    try {
      await collectFonts({ ...opts(), cacheDir });
      const before = requests;
      await collectFonts({ ...opts(), cacheDir });
      const after = requests;
      expect(after - before).toBe(0);
    } finally {
      rmSync(cacheDir, { recursive: true, force: true });
    }
  });

  test("transient failures are retried", async () => {
    const cacheDir = tempCache();
    try {
      failOnce.add("sinclair-ql");
      const results = await collectFonts({ ...opts(), cacheDir });
      const r = results.find((x) => x.alias === "sinclair-ql")!;
      expect(r.status).toBe("ok");
    } finally {
      rmSync(cacheDir, { recursive: true, force: true });
    }
  });

  test("refresh re-fetches from the server and keeps the same results", async () => {
    const cacheDir = tempCache();
    try {
      await collectFonts({ ...opts(), cacheDir });
      const before = requests;
      const results = await collectFonts({ ...opts(), cacheDir, refresh: true });
      const after = requests;
      expect(after - before).toBeGreaterThan(0);
      const byAlias = Object.fromEntries(results.map((r) => [r.alias, r]));
      expect(Object.keys(byAlias).sort()).toEqual(["fairfax-hax", "monolisa", "sinclair-ql"]);
      expect(byAlias["fairfax-hax"]!.qualifies).toBe(true);
    } finally {
      rmSync(cacheDir, { recursive: true, force: true });
    }
  });
});
