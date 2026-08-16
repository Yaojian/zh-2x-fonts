import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const fontsJson = {
  "fairfax-hax": { name: "Fairfax Hax", author: "Kreative Korporation", website: "https://example.org/fairfax" },
  "sinclair-ql": { name: "Sinclair QL", author: "Damien Guard", website: "https://example.org/sinclair" },
};

let server: ReturnType<typeof Bun.serve>;
beforeAll(() => {
  server = Bun.serve({
    port: 0,
    fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === "/fonts.json") return Response.json(fontsJson);
      const m = url.pathname.match(/^\/fonts\/resources\/([^/]+)\/\1\.woff2$/);
      if (m) return new Response(Bun.file(`fixtures/${m[1]}.woff2`));
      return new Response("not found", { status: 404 });
    },
  });
});
afterAll(() => server.stop());

function runCli(args: string[], cacheDir: string) {
  const child = spawn("bun", ["src/cli.ts", ...args], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ZHF_SOURCE_URL: `http://localhost:${server.port}`,
      ZHF_FALLBACK_URL: `http://localhost:${server.port}`,
      ZHF_CACHE_DIR: cacheDir,
    },
  });
  return new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    child.on("exit", (code) => resolve({ status: code, stdout, stderr }));
  });
}

describe("cli", () => {
  test("--json outputs machine-readable qualifying results", async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), "zhf-cli-"));
    try {
      const out = await runCli(["--json"], cacheDir);
      expect(out.status).toBe(0);
      const parsed = JSON.parse(out.stdout);
      const fairfax = parsed.find((r: any) => r.alias === "fairfax-hax");
      expect(fairfax.qualifies).toBe(true);
      expect(fairfax.programmingFontsUrl).toBe("https://www.programmingfonts.org/#fairfax-hax");
    } finally {
      rmSync(cacheDir, { recursive: true, force: true });
    }
  });

  test("table output lists qualifying fonts in English", async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), "zhf-cli-"));
    try {
      const out = await runCli([], cacheDir);
      expect(out.status).toBe(0);
      expect(out.stdout).toContain("QUALIFYING FONTS (1)");
      expect(out.stdout).toContain("Fairfax Hax");
      expect(out.stdout).toContain("https://www.programmingfonts.org/#fairfax-hax");
      expect(out.stdout).toContain("EXCLUDED (1)");
    } finally {
      rmSync(cacheDir, { recursive: true, force: true });
    }
  });
});
