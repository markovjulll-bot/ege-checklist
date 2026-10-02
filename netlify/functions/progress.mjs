// Хранит отметки учеников в Netlify Blobs.
// POST /api/progress            — ученик сохраняет свой прогресс {id, name, grade, checks}
// GET  /api/progress?id=CODE    — ученик загружает свой прогресс по коду
// GET  /api/progress            — учитель получает всех (заголовок x-teacher-pin)
// DELETE /api/progress?id=CODE  — учитель удаляет строку (заголовок x-teacher-pin)
import { getStore } from "@netlify/blobs";
import { ID, json, isTeacher, TRACKS, GRADES } from "../lib/shared.mjs";

const UNIT = /^[A-Za-z0-9_-]{1,12}$/;

// Отметки хранятся по версиям: {ege: {"9": [true,false…]}, oge: {…}, school: {…}}.
// Старые записи без версий считаются отметками ЕГЭ.
function cleanChecks(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  const src = TRACKS.some((t) => raw[t]) ? raw : { ege: raw };
  for (const t of TRACKS) {
    const obj = src[t];
    if (!obj || typeof obj !== "object") continue;
    const clean = {};
    for (const [k, arr] of Object.entries(obj).slice(0, 60)) {
      if (!UNIT.test(k) || !Array.isArray(arr)) continue;
      clean[k] = arr.slice(0, 12).map((v) => v === true);
    }
    out[t] = clean;
  }
  return out;
}

export default async (req) => {
  const store = getStore({ name: "ege-progress", consistency: "strong" });
  const url = new URL(req.url);
  const id = (url.searchParams.get("id") || "").toUpperCase();

  if (req.method === "POST") {
    let body;
    try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
    const sid = String(body?.id || "").toUpperCase();
    if (!ID.test(sid)) return json({ error: "bad id" }, 400);
    const record = {
      id: sid,
      name: String(body?.name || "").replace(/\s+/g, " ").trim().slice(0, 80),
      grade: GRADES.includes(Number(body?.grade)) ? Number(body.grade) : null,
      checks: cleanChecks(body?.checks),
      updated: new Date().toISOString(),
    };
    await store.setJSON(sid, record);
    return json({ ok: true, updated: record.updated });
  }

  if (req.method === "GET" && id) {
    if (!ID.test(id)) return json({ error: "bad id" }, 400);
    const rec = await store.get(id, { type: "json" });
    return rec ? json(rec) : json({ error: "not found" }, 404);
  }

  if (req.method === "GET") {
    if (!isTeacher(req)) return json({ error: "unauthorized" }, 401);
    const { blobs } = await store.list();
    const students = (await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })))).filter(Boolean);
    return json({ students });
  }

  if (req.method === "DELETE") {
    if (!isTeacher(req)) return json({ error: "unauthorized" }, 401);
    if (!ID.test(id)) return json({ error: "bad id" }, 400);
    await store.delete(id);
    return json({ ok: true });
  }

  return json({ error: "method not allowed" }, 405);
};

export const config = { path: "/api/progress" };
