import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
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

function runFetch(cacheDir: string) {
  const child = spawn("bun", ["src/fetch.ts"], {
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

describe("fonts:fetch", () => {
  test("downloads all fonts into the cache and reports progress", async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), "zhf-fetch-"));
    try {
      const out = await runFetch(cacheDir);
      expect(out.status).toBe(0);
      expect(out.stdout).toContain("downloading 2 fonts");
      expect(out.stdout).toContain("done: 2 downloaded, 0 failed");
      expect(existsSync(join(cacheDir, "fairfax-hax.woff2"))).toBe(true);
      expect(existsSync(join(cacheDir, "sinclair-ql.woff2"))).toBe(true);
    } finally {
      rmSync(cacheDir, { recursive: true, force: true });
    }
  });
});
