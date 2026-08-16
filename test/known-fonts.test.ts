import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { classifyLicense, generateKnownFonts, loadKnownFonts } from "../src/known-fonts.ts";

const fontsJson = {
  d2coding: { name: "D2Coding", license: "SIL OFL" },
  monolisa: { name: "MonoLisa", license: "commercial" },
  monofur: { name: "monofur", license: "freeware" },
  unifont: { name: "GNU Unifont", license: "GNU GPL" },
};

let server: ReturnType<typeof Bun.serve>;
beforeAll(() => {
  server = Bun.serve({
    port: 0,
    fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === "/fonts.json") return Response.json(fontsJson);
      return new Response("not found", { status: 404 });
    },
  });
});
afterAll(() => server.stop());

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "zhf-kf-"));
}

describe("classifyLicense", () => {
  test("maps redistributable licenses to free", () => {
    expect(classifyLicense("SIL OFL")).toBe("free");
    expect(classifyLicense("MIT")).toBe("free");
    expect(classifyLicense("GNU GPL")).toBe("free");
    expect(classifyLicense("Apache")).toBe("free");
    expect(classifyLicense("CC BY-SA 3.0")).toBe("free");
  });

  test("maps restricted or unknown licenses to commercial", () => {
    expect(classifyLicense("commercial")).toBe("commercial");
    expect(classifyLicense("freeware")).toBe("commercial");
    expect(classifyLicense("none")).toBe("commercial");
    expect(classifyLicense("unknown")).toBe("commercial");
  });
});

describe("generateKnownFonts + loadKnownFonts", () => {
  test("writes per-font files with name, license, distribution, and source", async () => {
    const cacheDir = tempDir();
    const dir = tempDir();
    const overrides = tempDir();
    try {
      const overridesFile = join(overrides, "overrides.json");
      writeFileSync(overridesFile, JSON.stringify({ monofur: "free" }));
      const source = `http://localhost:${server.port}`;
      const count = await generateKnownFonts({ cacheDir, source, fallbackSource: source, dir, overridesFile });
      expect(count).toBe(4);

      const d2 = JSON.parse(readFileSync(join(dir, "d2coding.json"), "utf8")) as Record<string, unknown>;
      expect(d2).toEqual({
        name: "D2Coding",
        license: "SIL OFL",
        distribution: "free",
        source: `${source}/fonts/resources/d2coding/d2coding.woff2`,
      });

      const monolisa = JSON.parse(readFileSync(join(dir, "monolisa.json"), "utf8")) as Record<string, unknown>;
      expect(monolisa.distribution).toBe("commercial");

      const monofur = JSON.parse(readFileSync(join(dir, "monofur.json"), "utf8")) as Record<string, unknown>;
      expect(monofur.distribution).toBe("free");

      const loaded = loadKnownFonts(dir);
      expect(Object.keys(loaded).sort()).toEqual(["d2coding", "monofur", "monolisa", "unifont"]);
      expect(loaded["unifont"]!.distribution).toBe("free");
    } finally {
      rmSync(cacheDir, { recursive: true, force: true });
      rmSync(dir, { recursive: true, force: true });
      rmSync(overrides, { recursive: true, force: true });
    }
  });

  test("loadKnownFonts returns empty object for a missing directory", () => {
    const dir = tempDir();
    try {
      expect(loadKnownFonts(dir)).toEqual({});
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
