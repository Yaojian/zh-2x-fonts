import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { collectFonts, type FontResult } from "./measure.ts";
import {
  DEFAULT_CACHE_DIR,
  FALLBACK_BASE_URL,
  SOURCE_BASE_URL,
} from "./fonts.ts";

export interface ServerOptions {
  port?: number;
  cacheDir?: string;
  source?: string;
  fallbackSource?: string;
}

export function createServer(options: ServerOptions = {}) {
  const cacheDir = options.cacheDir ?? process.env.ZHF_CACHE_DIR ?? DEFAULT_CACHE_DIR;
  const source = options.source ?? process.env.ZHF_SOURCE_URL ?? SOURCE_BASE_URL;
  const fallbackSource = options.fallbackSource ?? process.env.ZHF_FALLBACK_URL ?? FALLBACK_BASE_URL;
  const port = options.port ?? (process.env.PORT ? Number(process.env.PORT) : 3000);

  let fontsPromise: Promise<FontResult[]> | null = null;

  return Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);

      if (url.pathname === "/") {
        const html = await readFile(join(import.meta.dir, "../public/index.html"), "utf8");
        return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
      }

      if (url.pathname === "/api/fonts") {
        try {
          fontsPromise ??= collectFonts({ cacheDir, source, fallbackSource });
          const all = await fontsPromise;
          return Response.json(all.filter((r) => r.qualifies));
        } catch (e) {
          fontsPromise = null;
          return Response.json({ error: String(e) }, { status: 500 });
        }
      }

      const m = url.pathname.match(/^\/fonts\/([^/]+)\.woff2$/);
      if (m) {
        const file = Bun.file(join(cacheDir, `${m[1]}.woff2`));
        if (await file.exists()) {
          return new Response(file, { headers: { "content-type": "font/woff2" } });
        }
        return new Response("not found", { status: 404 });
      }

      return new Response("not found", { status: 404 });
    },
  });
}

if (import.meta.main) {
  const server = createServer();
  console.log(`zh-2x-fonts listening on http://localhost:${server.port}`);
}
