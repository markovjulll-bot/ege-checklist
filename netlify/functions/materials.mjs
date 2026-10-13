// База материалов учителя по заданиям ЕГЭ, ОГЭ и ВПР: презентации, ссылки на задания, игры, файлы.
// Видит и редактирует только учитель (x-teacher-pin).
//   GET    /api/materials               — все материалы
//   POST   /api/materials?upload=1      — загрузить файл (тело — файл, заголовок x-file-name), вернёт его описание
//   POST   /api/materials               — добавить или изменить материал {mid?, exam, task, kind, title, url, note, file}
//   DELETE /api/materials?mid=ID        — удалить материал (и его файл)
// По ссылке с id файла (длинный случайный код):
//   GET    /api/materials?file=FID      — открыть или скачать файл
import { getStore } from "@netlify/blobs";
import { json, isTeacher, newId, clean } from "../lib/shared.mjs";

export const FILE_LIMIT = 50 * 1024 * 1024;
const TYPES = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "image/png": "png", "image/jpeg": "jpg",
  "application/zip": "zip",
};
const EXAMS = ["ege", "oge", "vpr6_2027", "vpr7_2027", "vpr8_2027"];
const KINDS = ["presentation", "tasks", "game", "theory", "file"];
const text = (v, n) => String(v ?? "").replace(/\r\n/g, "\n").trim().slice(0, n);
function cleanUrl(v) {
  let s = String(v || "").trim(); if (!s) return "";
  if (!/^[a-z]+:\/\//i.test(s)) s = "https://" + s;
  try { const u = new URL(s); return /^https?:$/.test(u.protocol) ? u.href : ""; } catch { return ""; }
}

export default async (req) => {
  const store = getStore({ name: "ege-materials", consistency: "strong" });
  const url = new URL(req.url);
  const q = (k) => url.searchParams.get(k) || "";
  const readIndex = async () => (await store.get("index", { type: "json" })) || [];

  if (req.method === "GET" && q("file")) {
    const fid = q("file");
    const meta = (await readIndex()).map((m) => m.file).find((f) => f && f.fid === fid);
    if (!meta) return json({ error: "not found" }, 404);
    const buf = await store.get("f/" + fid, { type: "arrayBuffer" });
    if (!buf) return json({ error: "not found" }, 404);
    const disp = meta.type === "application/pdf" || meta.type.startsWith("image/") ? "inline" : "attachment";
    return new Response(buf, { headers: { "Content-Type": meta.type,
      "Content-Disposition": `${disp}; filename*=UTF-8''${encodeURIComponent(meta.filename)}`, "Cache-Control": "private, max-age=300" } });
  }

  if (!isTeacher(req)) return json({ error: "unauthorized" }, 401);

  if (req.method === "GET") return json({ items: await readIndex() });

  if (req.method === "POST" && q("upload")) {
    const ctype = (req.headers.get("content-type") || "").split(";")[0].trim();
    if (!TYPES[ctype]) return json({ error: "type" }, 415);
    const buf = await req.arrayBuffer();
    if (!buf.byteLength) return json({ error: "empty" }, 400);
    if (buf.byteLength > FILE_LIMIT) return json({ error: "too big" }, 413);
    const fid = newId(16);
    const filename = clean(decodeURIComponent(req.headers.get("x-file-name") || ""), 150) || "file." + TYPES[ctype];
    await store.set("f/" + fid, buf);
    return json({ ok: true, file: { fid, filename, type: ctype, size: buf.byteLength } });
  }

  if (req.method === "POST") {
    let b; try { b = await req.json(); } catch { return json({ error: "bad json" }, 400); }
    if (!EXAMS.includes(b?.exam)) return json({ error: "exam" }, 400);
    const task = clean(b?.task, 10) || "common";
    const kind = KINDS.includes(b?.kind) ? b.kind : "file";
    const link = cleanUrl(b?.url);
    const f = b?.file && /^[A-Z2-9]{16}$/.test(b.file.fid)
      ? { fid: b.file.fid, filename: clean(b.file.filename, 150), type: TYPES[b.file.type] ? b.file.type : "application/pdf", size: Number(b.file.size) || 0 } : null;
    if (!link && !f) return json({ error: "empty" }, 400);
    const title = clean(b?.title, 150) || (f ? f.filename : new URL(link).hostname);
    const list = await readIndex();
    const now = new Date().toISOString();
    let m = b?.mid ? list.find((x) => x.mid === b.mid) : null;
    if (b?.mid && !m) return json({ error: "not found" }, 404);
    if (!m) { m = { mid: newId(10), created: now }; list.push(m); }
    else if (m.file && (!f || f.fid !== m.file.fid)) await store.delete("f/" + m.file.fid);
    Object.assign(m, { exam: b.exam, task, kind, title, url: link, note: text(b?.note, 1000), file: f, updated: now });
    await store.setJSON("index", list);
    return json({ ok: true, item: m });
  }

  if (req.method === "DELETE") {
    const list = await readIndex();
    const m = list.find((x) => x.mid === q("mid"));
    if (!m) return json({ error: "not found" }, 404);
    if (m.file) await store.delete("f/" + m.file.fid);
    await store.setJSON("index", list.filter((x) => x.mid !== m.mid));
    return json({ ok: true });
  }

  return json({ error: "method not allowed" }, 405);
};

export const config = { path: "/api/materials" };
