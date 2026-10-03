// Замена @netlify/blobs для своего сервера: данные лежат в файлах на диске.
// Папка задаётся переменной DATA_DIR (по умолчанию ./data рядом с проектом).
import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = process.env.DATA_DIR || path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "data");
const safe = (k) => encodeURIComponent(k).replace(/\./g, "%2E");
const unsafe = (f) => decodeURIComponent(f);

async function writeAtomic(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = file + ".tmp-" + process.pid + "-" + Date.now();
  await fs.writeFile(tmp, data);
  await fs.rename(tmp, file);
}

export function getStore(opts) {
  const name = typeof opts === "string" ? opts : opts.name;
  const dir = path.join(ROOT, name.replace(/[^a-z0-9-]/gi, "_"));
  const file = (k) => path.join(dir, safe(k));
  return {
    async setJSON(k, v) { await writeAtomic(file(k), JSON.stringify(v)); },
    async set(k, v) { await writeAtomic(file(k), Buffer.from(v instanceof ArrayBuffer ? new Uint8Array(v) : v)); },
    async get(k, o = {}) {
      let buf;
      try { buf = await fs.readFile(file(k)); } catch (e) { if (e.code === "ENOENT") return null; throw e; }
      if (o.type === "json") return JSON.parse(buf.toString("utf8"));
      if (o.type === "arrayBuffer") return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      return buf.toString("utf8");
    },
    async list() {
      let names = [];
      try { names = await fs.readdir(dir); } catch (e) { if (e.code !== "ENOENT") throw e; }
      return { blobs: names.filter((n) => !n.includes(".tmp-")).map((n) => ({ key: unsafe(n) })) };
    },
    async delete(k) { try { await fs.unlink(file(k)); } catch (e) { if (e.code !== "ENOENT") throw e; } },
  };
}
