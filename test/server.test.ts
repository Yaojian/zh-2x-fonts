import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "../src/server.ts";

const fontsJson = {
  "fairfax-hax": { name: "Fairfax Hax", author: "Kreative Korporation", website: "https://example.org/fairfax" },
  "sinclair-ql": { name: "Sinclair QL", author: "Damien Guard", website: "https://example.org/sinclair" },
};

let dataServer: ReturnType<typeof Bun.serve>;
let cacheDir: string;
let app: ReturnType<typeof createServer>;
let base: string;

beforeAll(async () => {
  cacheDir = mkdtempSync(join(tmpdir(), "zhf-srv-"));
  dataServer = Bun.serve({
    port: 0,
    fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === "/fonts.json") return Response.json(fontsJson);
      const m = url.pathname.match(/^\/fonts\/resources\/([^/]+)\/\1\.woff2$/);
      if (m) return new Response(Bun.file(`fixtures/${m[1]}.woff2`));
      return new Response("not found", { status: 404 });
    },
  });
  const dataUrl = `http://localhost:${dataServer.port}`;
  app = createServer({ port: 0, cacheDir, source: dataUrl, fallbackSource: dataUrl });
  base = `http://localhost:${app.port}`;
});

afterAll(() => {
  app.stop();
  dataServer.stop();
  rmSync(cacheDir, { recursive: true, force: true });
});

describe("server", () => {
  test("serves the page", async () => {
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("中英倍宽字体");
  });

  test("/api/fonts returns only qualifying fonts", async () => {
    const res = await fetch(`${base}/api/fonts`);
    expect(res.status).toBe(200);
    const fonts = (await res.json()) as any[];
    expect(fonts.length).toBe(1);
    expect(fonts[0]!.alias).toBe("fairfax-hax");
  });

  test("serves cached woff2 files", async () => {
    const res = await fetch(`${base}/fonts/fairfax-hax.woff2`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("font/woff2");
    expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });

  test("returns 404 for unknown routes", async () => {
    const res = await fetch(`${base}/nope`);
    expect(res.status).toBe(404);
  });
});
