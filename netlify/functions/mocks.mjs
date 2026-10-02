// Результаты пробных экзаменов.
// GET    /api/mocks?id=CODE                — пробники ученика
// GET    /api/mocks                        — все пробники (учитель, x-teacher-pin)
// POST   /api/mocks  {id, mock}            — добавить или изменить пробник; mock.exam: ege | oge | vpr6 | vpr7
//        ученик может менять только свои записи; учитель — любые
// DELETE /api/mocks?id=CODE&mid=MID        — удалить (ученик — только свои записи)
import { getStore } from "@netlify/blobs";
import { ID, EXAM_MAX, json, isTeacher, newId, clean } from "../lib/shared.mjs";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function cleanScores(raw, exam) {
  const arr = Array.isArray(raw) ? raw : [];
  return EXAM_MAX[exam].map((m, i) => {
    const v = Math.round(Number(arr[i]));
    return Number.isFinite(v) ? Math.min(Math.max(v, 0), m) : 0;
  });
}

export default async (req) => {
  const store = getStore({ name: "ege-mocks", consistency: "strong" });
  const url = new URL(req.url);
  const id = (url.searchParams.get("id") || "").toUpperCase();
  const teacher = isTeacher(req);

  if (req.method === "GET" && id) {
    if (!ID.test(id)) return json({ error: "bad id" }, 400);
    const rec = await store.get(id, { type: "json" });
    return json({ id, items: rec?.items || [] });
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
    const m = body?.mock || {};
    const exam = EXAM_MAX[m.exam] ? m.exam : "ege";
    const date = DATE.test(m.date) ? m.date : new Date().toISOString().slice(0, 10);
    const rec = (await store.get(sid, { type: "json" })) || { id: sid, items: [] };
    const now = new Date().toISOString();
    let item;
    if (m.mid) {
      item = rec.items.find((x) => x.mid === m.mid);
      if (!item) return json({ error: "not found" }, 404);
      if (!teacher && item.by !== "student") return json({ error: "forbidden" }, 403);
      item.exam = item.exam || "ege";
      if (item.exam !== exam) return json({ error: "exam" }, 400);
    } else {
      if (rec.items.length >= 60) return json({ error: "too many" }, 400);
      item = { mid: newId(10), by: teacher ? "teacher" : "student", created: now, exam };
      rec.items.push(item);
    }
    item.date = date;
    item.title = clean(m.title, 80) || (item.exam.startsWith("vpr") ? "Проверочная работа" : "Пробный экзамен");
    item.scores = cleanScores(m.scores, item.exam);
    item.updated = now;
    rec.items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    await store.setJSON(sid, rec);
    return json({ ok: true, item });
  }

  if (req.method === "DELETE") {
    const mid = url.searchParams.get("mid") || "";
    if (!ID.test(id) || !mid) return json({ error: "bad id" }, 400);
    const rec = await store.get(id, { type: "json" });
    const item = rec?.items?.find((x) => x.mid === mid);
    if (!item) return json({ error: "not found" }, 404);
    if (!teacher && item.by !== "student") return json({ error: "forbidden" }, 403);
    rec.items = rec.items.filter((x) => x.mid !== mid);
    await store.setJSON(id, rec);
    return json({ ok: true });
  }

  return json({ error: "method not allowed" }, 405);
};

export const config = { path: "/api/mocks" };
