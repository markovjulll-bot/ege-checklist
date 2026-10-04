// Читательский дневник: у каждого ученика свой.
// GET    /api/diary?id=CODE          — записи ученика
// GET    /api/diary                  — все дневники (учитель, x-teacher-pin)
// POST   /api/diary {id, entry}      — добавить или изменить запись
//        ученик меняет свои поля; комментарий может писать только учитель
// DELETE /api/diary?id=CODE&eid=EID  — удалить запись
import { getStore } from "@netlify/blobs";
import { ID, json, isTeacher, newId, clean } from "../lib/shared.mjs";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const text = (v, n) => String(v ?? "").replace(/\r\n/g, "\n").trim().slice(0, n);
const STUDENT_FIELDS = (e) => ({
  title: clean(e.title, 150),
  author: clean(e.author, 100),
  started: DATE.test(e.started) ? e.started : "",
  finished: DATE.test(e.finished) ? e.finished : "",
  heroes: text(e.heroes, 1000),
  summary: text(e.summary, 4000),
  impression: text(e.impression, 4000),
  quote: text(e.quote, 1000),
  rating: Math.min(5, Math.max(0, Math.round(Number(e.rating) || 0))),
});

export default async (req) => {
  const store = getStore({ name: "ege-diary", consistency: "strong" });
  const url = new URL(req.url);
  const id = (url.searchParams.get("id") || "").toUpperCase();
  const teacher = isTeacher(req);

  if (req.method === "GET" && id) {
    if (!ID.test(id)) return json({ error: "bad id" }, 400);
    const rec = await store.get(id, { type: "json" });
    return json({ id, entries: rec?.entries || [] });
  }

  if (req.method === "GET") {
    if (!teacher) return json({ error: "unauthorized" }, 401);
    const { blobs } = await store.list();
    const students = (await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })))).filter(Boolean);
    return json({ students });
  }

  if (req.method === "POST") {
    let body;
    try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
    const sid = String(body?.id || "").toUpperCase();
    if (!ID.test(sid)) return json({ error: "bad id" }, 400);
    const e = body?.entry || {};
    const rec = (await store.get(sid, { type: "json" })) || { id: sid, entries: [] };
    const now = new Date().toISOString();
    let item;
    if (e.eid) {
      item = rec.entries.find((x) => x.eid === e.eid);
      if (!item) return json({ error: "not found" }, 404);
    } else {
      if (rec.entries.length >= 300) return json({ error: "too many" }, 400);
      item = { eid: newId(10), created: now, teacherComment: "" };
      rec.entries.push(item);
    }
    const onlyComment = teacher && e.commentOnly === true;
    if (!onlyComment) {
      const f = STUDENT_FIELDS(e);
      if (!f.title) return json({ error: "no title" }, 400);
      Object.assign(item, f);
    }
    if (teacher && "teacherComment" in e) { item.teacherComment = text(e.teacherComment, 2000); item.commented = now; }
    item.updated = now;
    rec.entries.sort((a, b) => ((b.finished || b.started || b.created) > (a.finished || a.started || a.created) ? 1 : -1));
    await store.setJSON(sid, rec);
    return json({ ok: true, entry: item });
  }

  if (req.method === "DELETE") {
    const eid = url.searchParams.get("eid") || "";
    if (!ID.test(id) || !eid) return json({ error: "bad id" }, 400);
    const rec = await store.get(id, { type: "json" });
    if (!rec || !rec.entries.some((x) => x.eid === eid)) return json({ error: "not found" }, 404);
    rec.entries = rec.entries.filter((x) => x.eid !== eid);
    await store.setJSON(id, rec);
    return json({ ok: true });
  }

  return json({ error: "method not allowed" }, 405);
};

export const config = { path: "/api/diary" };
