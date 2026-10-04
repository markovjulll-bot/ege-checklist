// Раздатки: у каждого ученика свои материалы.
// GET    /api/files?student=CODE&track=oge — раздатки ученика (+ старые общие для его версии)
// GET    /api/files                 — весь список (для учителя)
// PUT    /api/files?fid=ID          — учитель меняет, кому видна раздатка: {students:[…]}
// GET    /api/files?fid=ID          — открыть файл
// POST   /api/files                 — учитель загружает файл (тело — сам файл) или ссылку (JSON)
// DELETE /api/files?fid=ID          — учитель удаляет
import { getStore } from "@netlify/blobs";
import { ID, json, isTeacher, newId, clean, TRACKS } from "../lib/shared.mjs";

const LIMIT = 4.5 * 1024 * 1024;
const TYPES = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};

// Для каких версий раздатка: пустой список — для всех
function cleanTracks(v) {
  const arr = Array.isArray(v) ? v : String(v || "").split(",");
  return [...new Set(arr.map((x) => String(x).trim()).filter((x) => TRACKS.includes(x)))];
}

// Кому видна раздатка: список кодов учеников
function cleanStudents(v) {
  const arr = Array.isArray(v) ? v : String(v || "").split(",");
  return [...new Set(arr.map((x) => String(x).trim().toUpperCase()).filter((x) => ID.test(x)))].slice(0, 300);
}

async function readIndex(store) {
  return (await store.get("index", { type: "json" })) || [];
}

export default async (req) => {
  const store = getStore({ name: "ege-files", consistency: "strong" });
  const url = new URL(req.url);
  const fid = url.searchParams.get("fid") || "";

  if (req.method === "GET" && fid) {
    const list = await readIndex(store);
    const meta = list.find((x) => x.fid === fid && x.kind === "file");
    if (!meta) return json({ error: "not found" }, 404);
    const buf = await store.get("f/" + fid, { type: "arrayBuffer" });
    if (!buf) return json({ error: "not found" }, 404);
    const name = encodeURIComponent(meta.filename || "file." + (TYPES[meta.type] || "bin"));
    const disp = meta.type === "application/pdf" || meta.type.startsWith("image/") ? "inline" : "attachment";
    return new Response(buf, {
      headers: {
        "Content-Type": meta.type,
        "Content-Disposition": `${disp}; filename*=UTF-8''${name}`,
        "Cache-Control": "public, max-age=300",
      },
    });
  }

  if (req.method === "GET") {
    const track = url.searchParams.get("track") || "";
    const student = (url.searchParams.get("student") || "").toUpperCase();
    let items = await readIndex(store);
    if (student || track) {
      items = items.filter((x) => Array.isArray(x.students)
        ? ID.test(student) && x.students.includes(student)
        : (!x.tracks || !x.tracks.length || x.tracks.includes(track)));   // старые общие раздатки
      items = items.map(({ students, ...rest }) => rest);                    // ученику не показываем чужие коды
    }
    return json({ items });
  }

  if (req.method === "POST") {
    if (!isTeacher(req)) return json({ error: "unauthorized" }, 401);
    const ctype = (req.headers.get("content-type") || "").split(";")[0].trim();
    const list = await readIndex(store);
    const id = newId(10);
    const base = {
      fid: id,
      title: clean(decodeURIComponent(req.headers.get("x-title") || ""), 120),
      topic: clean(decodeURIComponent(req.headers.get("x-topic") || ""), 60) || "Общее",
      students: cleanStudents(req.headers.get("x-students")),
      uploaded: new Date().toISOString(),
    };

    if (ctype !== "application/json" && !base.students.length) return json({ error: "no students" }, 400);
    if (ctype === "application/json") {
      let body;
      try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
      let link;
      try { link = new URL(String(body?.url || "")); } catch { return json({ error: "bad url" }, 400); }
      if (!/^https?:$/.test(link.protocol)) return json({ error: "bad url" }, 400);
      if (!cleanStudents(body?.students).length) return json({ error: "no students" }, 400);
      const item = { ...base, kind: "link", url: link.href,
        title: clean(body?.title, 120) || link.hostname, topic: clean(body?.topic, 60) || "Общее", students: cleanStudents(body?.students) };
      list.unshift(item);
      await store.setJSON("index", list);
      return json({ ok: true, item });
    }

    if (!TYPES[ctype]) return json({ error: "type" }, 415);
    const buf = await req.arrayBuffer();
    if (!buf.byteLength) return json({ error: "empty" }, 400);
    if (buf.byteLength > LIMIT) return json({ error: "too big" }, 413);
    const filename = clean(decodeURIComponent(req.headers.get("x-file-name") || ""), 150) || "file." + TYPES[ctype];
    await store.set("f/" + id, buf);
    const item = { ...base, kind: "file", type: ctype, size: buf.byteLength, filename,
      title: base.title || filename.replace(/\.[^.]+$/, "") };
    list.unshift(item);
    await store.setJSON("index", list);
    return json({ ok: true, item });
  }

  if (req.method === "PUT") {
    if (!isTeacher(req)) return json({ error: "unauthorized" }, 401);
    let body;
    try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
    const list = await readIndex(store);
    const item = list.find((x) => x.fid === fid);
    if (!item) return json({ error: "not found" }, 404);
    const st = cleanStudents(body?.students);
    if (!st.length) return json({ error: "no students" }, 400);
    item.students = st; delete item.tracks;
    await store.setJSON("index", list);
    return json({ ok: true, item });
  }

  if (req.method === "DELETE") {
    if (!isTeacher(req)) return json({ error: "unauthorized" }, 401);
    const list = await readIndex(store);
    const item = list.find((x) => x.fid === fid);
    if (!item) return json({ error: "not found" }, 404);
    if (item.kind === "file") await store.delete("f/" + fid);
    await store.setJSON("index", list.filter((x) => x.fid !== fid));
    return json({ ok: true });
  }

  return json({ error: "method not allowed" }, 405);
};

export const config = { path: "/api/files" };
