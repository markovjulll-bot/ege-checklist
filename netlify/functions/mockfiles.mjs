// Файлы к результатам пробников: проверенные работы (сканы, фото, PDF).
// Прикрепляет и удаляет только учитель; открыть файл может ученик по своему коду.
//   POST   /api/mockfiles?id=CODE&mid=MID          — прикрепить файл (тело — сам файл, заголовок x-file-name)
//   GET    /api/mockfiles?id=CODE&fid=FID          — открыть файл
//   DELETE /api/mockfiles?id=CODE&mid=MID&fid=FID  — удалить файл
import { getStore } from "@netlify/blobs";
import { ID, json, isTeacher, newId, clean } from "../lib/shared.mjs";

export const FILE_LIMIT = 15 * 1024 * 1024;
const MAX_FILES = 12;
const TYPES = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};
const INLINE = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

export default async (req) => {
  const mocks = getStore({ name: "ege-mocks", consistency: "strong" });
  const files = getStore({ name: "ege-mock-files", consistency: "strong" });
  const url = new URL(req.url);
  const q = (k) => url.searchParams.get(k) || "";
  const id = q("id").toUpperCase(), mid = q("mid"), fid = q("fid");
  if (!ID.test(id)) return json({ error: "bad id" }, 400);
  const rec = await mocks.get(id, { type: "json" });

  if (req.method === "GET") {
    const meta = (rec?.items || []).flatMap((it) => it.files || []).find((f) => f.fid === fid);
    if (!meta) return json({ error: "not found" }, 404);
    const buf = await files.get("f/" + fid, { type: "arrayBuffer" });
    if (!buf) return json({ error: "not found" }, 404);
    const name = encodeURIComponent(meta.name || "work." + (TYPES[meta.type] || "bin"));
    return new Response(buf, {
      headers: {
        "Content-Type": meta.type,
        "Content-Disposition": `${INLINE.includes(meta.type) ? "inline" : "attachment"}; filename*=UTF-8''${name}`,
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  if (!isTeacher(req)) return json({ error: "unauthorized" }, 401);
  const item = (rec?.items || []).find((x) => x.mid === mid);
  if (!item) return json({ error: "not found" }, 404);

  if (req.method === "POST") {
    const ctype = (req.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!TYPES[ctype]) return json({ error: "type" }, 415);
    item.files = item.files || [];
    if (item.files.length >= MAX_FILES) return json({ error: "too many" }, 400);
    const buf = await req.arrayBuffer();
    if (!buf.byteLength) return json({ error: "empty" }, 400);
    if (buf.byteLength > FILE_LIMIT) return json({ error: "too big" }, 413);
    let raw = req.headers.get("x-file-name") || "";
    try { raw = decodeURIComponent(raw); } catch {}
    const file = {
      fid: newId(16),
      name: clean(raw, 150) || "Работа." + TYPES[ctype],
      type: ctype,
      size: buf.byteLength,
      uploaded: new Date().toISOString(),
    };
    await files.set("f/" + file.fid, buf);
    item.files.push(file);
    await mocks.setJSON(id, rec);
    return json({ ok: true, file });
  }

  if (req.method === "DELETE") {
    const before = (item.files || []).length;
    item.files = (item.files || []).filter((f) => f.fid !== fid);
    if (item.files.length === before) return json({ error: "not found" }, 404);
    await files.delete("f/" + fid);
    await mocks.setJSON(id, rec);
    return json({ ok: true });
  }

  return json({ error: "method not allowed" }, 405);
};

export const config = { path: "/api/mockfiles" };
