// Хранит отметки учеников в Netlify Blobs.
// POST /api/progress            — ученик сохраняет свой прогресс {id, name, checks}
// GET  /api/progress?id=CODE    — ученик загружает свой прогресс по коду
// GET  /api/progress            — учитель получает всех (заголовок x-teacher-pin)
// DELETE /api/progress?id=CODE  — учитель удаляет строку (заголовок x-teacher-pin)
import { getStore } from "@netlify/blobs";

const ID = /^[A-Z2-9]{8}$/;
// Сколько пунктов в каждом задании (1–27) — должно совпадать с public/tasks.js
const ITEMS = [4,4,4,4,3,3,6,4,4,5,5,5,5,5,4,4,4,5,4,3,4,5,3,4,3,4,6];

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

function isTeacher(req) {
  const pin = Netlify.env.get("TEACHER_PIN") || "";
  const got = req.headers.get("x-teacher-pin") || "";
  if (!pin || got.length !== pin.length) return false;
  let diff = 0;
  for (let i = 0; i < pin.length; i++) diff |= pin.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}

function cleanChecks(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  for (let n = 1; n <= 27; n++) {
    const arr = raw[n] ?? raw[String(n)];
    if (!Array.isArray(arr)) continue;
    out[n] = Array.from({ length: ITEMS[n - 1] }, (_, j) => arr[j] === true);
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
