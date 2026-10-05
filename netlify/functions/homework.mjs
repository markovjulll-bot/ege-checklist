// Домашние задания.
// Учитель (x-teacher-pin):
//   GET    /api/homework                 — все задания и отметки учеников
//   POST   /api/homework                 — создать или изменить задание {hid?, title, text, links, files, due, students}
//   POST   /api/homework?upload=1        — загрузить файл к заданию (тело — файл), вернёт его описание
//   DELETE /api/homework?hid=ID          — удалить задание
// Ученик:
//   GET    /api/homework?student=CODE    — задания ученика и его отметки
//   PUT    /api/homework?student=CODE    — отметить {hid, done: true | false}
// Все:
//   GET    /api/homework?file=FID        — открыть файл задания
import { getStore } from "@netlify/blobs";
import { ID, json, isTeacher, newId, clean } from "../lib/shared.mjs";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const LIMIT = 4.5 * 1024 * 1024;
const TYPES = {
  "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};
const text = (v, n) => String(v ?? "").replace(/\r\n/g, "\n").trim().slice(0, n);
const students = (v) => [...new Set((Array.isArray(v) ? v : []).map((x) => String(x).toUpperCase()).filter((x) => ID.test(x)))].slice(0, 300);
function links(v) {
  const out = [];
  for (const raw of Array.isArray(v) ? v : []) {
    const url = typeof raw === "string" ? raw : raw?.url;
    try { const u = new URL(String(url || "").trim()); if (/^https?:$/.test(u.protocol)) out.push({ url: u.href, title: clean(raw?.title, 120) || u.hostname }); } catch {}
  }
  return out.slice(0, 20);
}

export default async (req) => {
  const store = getStore({ name: "ege-homework", consistency: "strong" });
  const url = new URL(req.url);
  const q = (k) => url.searchParams.get(k) || "";
  const teacher = isTeacher(req);
  const readIndex = async () => (await store.get("index", { type: "json" })) || [];

  // файл задания
  if (req.method === "GET" && q("file")) {
    const fid = q("file");
    const list = await readIndex();
    const meta = list.flatMap((h) => h.files || []).find((f) => f.fid === fid);
    if (!meta) return json({ error: "not found" }, 404);
    const buf = await store.get("f/" + fid, { type: "arrayBuffer" });
    if (!buf) return json({ error: "not found" }, 404);
    const disp = meta.type === "application/pdf" || meta.type.startsWith("image/") ? "inline" : "attachment";
    return new Response(buf, { headers: { "Content-Type": meta.type,
      "Content-Disposition": `${disp}; filename*=UTF-8''${encodeURIComponent(meta.filename)}`, "Cache-Control": "public, max-age=300" } });
  }

  // ученик: свои задания
  if (req.method === "GET" && q("student")) {
    const sid = q("student").toUpperCase();
    if (!ID.test(sid)) return json({ error: "bad id" }, 400);
    const list = (await readIndex()).filter((h) => h.students.includes(sid)).map(({ students, ...rest }) => rest);
    const status = (await store.get("s/" + sid, { type: "json" })) || {};
    return json({ items: list, status });
  }

  // ученик: отметка выполнено / не выполнено
  if (req.method === "PUT") {
    const sid = q("student").toUpperCase();
    if (!ID.test(sid)) return json({ error: "bad id" }, 400);
    let b; try { b = await req.json(); } catch { return json({ error: "bad json" }, 400); }
    const list = await readIndex();
    const hw = list.find((h) => h.hid === b?.hid);
    if (!hw || !hw.students.includes(sid)) return json({ error: "not found" }, 404);
    const status = (await store.get("s/" + sid, { type: "json" })) || {};
    if (b.done === null) delete status[hw.hid];
    else status[hw.hid] = { done: b.done === true, at: new Date().toISOString() };
    await store.setJSON("s/" + sid, status);
    return json({ ok: true, status: status[hw.hid] || null });
  }

  if (!teacher) return json({ error: "unauthorized" }, 401);

  if (req.method === "GET") {
    const items = await readIndex();
    const { blobs } = await store.list({ prefix: "s/" });
    const status = {};
    for (const b of blobs) status[b.key.slice(2)] = (await store.get(b.key, { type: "json" })) || {};
    return json({ items, status });
  }

  if (req.method === "POST" && q("upload")) {
    const ctype = (req.headers.get("content-type") || "").split(";")[0].trim();
    if (!TYPES[ctype]) return json({ error: "type" }, 415);
    const buf = await req.arrayBuffer();
    if (!buf.byteLength) return json({ error: "empty" }, 400);
    if (buf.byteLength > LIMIT) return json({ error: "too big" }, 413);
    const fid = newId(10);
    const filename = clean(decodeURIComponent(req.headers.get("x-file-name") || ""), 150) || "file." + TYPES[ctype];
    await store.set("f/" + fid, buf);
    return json({ ok: true, file: { fid, filename, type: ctype, size: buf.byteLength } });
  }

  if (req.method === "POST") {
    let b; try { b = await req.json(); } catch { return json({ error: "bad json" }, 400); }
    const list = await readIndex();
    const st = students(b?.students);
    if (!st.length) return json({ error: "no students" }, 400);
    const body = text(b?.text, 6000);
    const ln = links(b?.links);
    const files = (Array.isArray(b?.files) ? b.files : []).filter((f) => f && /^[A-Z2-9]{10}$/.test(f.fid))
      .map((f) => ({ fid: f.fid, filename: clean(f.filename, 150), type: TYPES[f.type] ? f.type : "application/pdf", size: Number(f.size) || 0 })).slice(0, 20);
    if (!body && !ln.length && !files.length) return json({ error: "empty" }, 400);
    const now = new Date().toISOString();
    let hw = b?.hid ? list.find((h) => h.hid === b.hid) : null;
    if (b?.hid && !hw) return json({ error: "not found" }, 404);
    if (!hw) { hw = { hid: newId(10), created: now }; list.unshift(hw); }
    else {
      const keep = new Set(files.map((f) => f.fid));
      for (const f of hw.files || []) if (!keep.has(f.fid)) await store.delete("f/" + f.fid);
    }
    Object.assign(hw, { title: clean(b?.title, 150), text: body, links: ln, files, due: DATE.test(b?.due) ? b.due : "", students: st, updated: now });
    await store.setJSON("index", list);
    return json({ ok: true, item: hw });
  }

  if (req.method === "DELETE") {
    const list = await readIndex();
    const hw = list.find((h) => h.hid === q("hid"));
    if (!hw) return json({ error: "not found" }, 404);
    for (const f of hw.files || []) await store.delete("f/" + f.fid);
    await store.setJSON("index", list.filter((h) => h.hid !== hw.hid));
    return json({ ok: true });
  }

  return json({ error: "method not allowed" }, 405);
};

export const config = { path: "/api/homework" };
