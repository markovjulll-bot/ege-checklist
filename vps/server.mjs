// Сервер кабинета для своего VPS: отдаёт страницы из public/ и API из netlify/functions/.
import http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUB = path.resolve(HERE, "..", "public");
const PORT = Number(process.env.PORT || 8080);
const LIMIT = 6 * 1024 * 1024;

const fns = {};
for (const name of ["progress", "mocks", "files", "backup", "diary"]) {
  fns[name] = (await import(path.resolve(HERE, "..", "netlify", "functions", name + ".mjs"))).default;
}
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json", ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon" };

async function readBody(req) {
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > LIMIT) throw Object.assign(new Error("too big"), { status: 413 }); chunks.push(c); }
  return Buffer.concat(chunks);
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://" + (req.headers.host || "localhost"));
    const m = url.pathname.match(/^\/api\/([a-z]+)$/);
    if (m && fns[m[1]]) {
      const body = ["GET", "HEAD"].includes(req.method) ? undefined : await readBody(req);
      const headers = {}; for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers[k] = v;
      const r = await fns[m[1]](new Request("https://" + (req.headers.host || "localhost") + url.pathname + url.search, { method: req.method, headers, body }));
      const out = Buffer.from(await r.arrayBuffer());
      res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(out); return;
    }
    let p = decodeURIComponent(url.pathname);
    if (p === "/") p = "/index.html";
    const file = path.resolve(PUB, "." + p);
    if (!file.startsWith(PUB + path.sep)) { res.writeHead(403); res.end(); return; }
    const data = await fs.readFile(file);
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream",
      "Cache-Control": file.endsWith(".html") ? "no-cache" : "public, max-age=300",
      ...(p === "/teacher.html" ? { "X-Robots-Tag": "noindex" } : {}) });
    res.end(data);
  } catch (e) {
    if (e.code === "ENOENT" || e.code === "EISDIR") { res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); res.end("Страница не найдена"); return; }
    res.writeHead(e.status || 500, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: e.status === 413 ? "too big" : "server error" }));
    if (!e.status) console.error(e);
  }
}).listen(PORT, "127.0.0.1", () => console.log("Кабинет запущен на порту " + PORT));
