// Заявки на пробник: публичная форма /probnik.html.
// Все:
//   POST   /api/signup                  — оставить заявку {name, grade, exam, contact, consent}
// Учитель (x-teacher-pin):
//   GET    /api/signup                  — все заявки
//   PATCH  /api/signup?sid=ID           — изменить статус {status: "new" | "contacted" | "booked" | "declined"}
//   DELETE /api/signup?sid=ID           — удалить заявку
import { getStore } from "@netlify/blobs";
import { json, isTeacher, newId, clean } from "../lib/shared.mjs";

const EXAMS = ["ЕГЭ", "ОГЭ", "ВПР"];
const STATUSES = ["new", "contacted", "booked", "declined"];
const hits = new Map();   // простая защита от спама: не больше 5 заявок в час с одного адреса

function tooMany(req) {
  const ip = (req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "?").split(",")[0].trim();
  const now = Date.now(), list = (hits.get(ip) || []).filter((t) => now - t < 3600e3);
  list.push(now); hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > 5;
}

export default async (req) => {
  const store = getStore({ name: "ege-signups", consistency: "strong" });
  const url = new URL(req.url);
  const YEAR = 365 * 24 * 3600e3;
  // заявки старше года удаляются сами — так обещано в политике обработки данных
  const readIndex = async () => {
    const all = (await store.get("index", { type: "json" })) || [];
    const fresh = all.filter((x) => !x.created || Date.now() - Date.parse(x.created) < YEAR);
    if (fresh.length !== all.length) await store.setJSON("index", fresh);
    return fresh;
  };

  if (req.method === "POST") {
    let b; try { b = await req.json(); } catch { return json({ error: "bad json" }, 400); }
    if (b?.website) return json({ ok: true });            // поле-ловушка для ботов
    const name = clean(b?.name, 80), contact = clean(b?.contact, 80);
    const grade = Number(b?.grade);
    const exam = EXAMS.includes(b?.exam) ? b.exam : "";
    if (!name || !contact || !(grade >= 6 && grade <= 11) || !exam) return json({ error: "fields" }, 400);
    if (b?.consent !== true) return json({ error: "consent" }, 400);
    if (tooMany(req)) return json({ error: "too many" }, 429);
    const list = await readIndex();
    if (list.length >= 2000) return json({ error: "full" }, 507);
    const now = new Date().toISOString();
    // фиксируем, когда и на какую редакцию согласия отметили галочку
    const item = { sid: newId(10), name, grade, exam, contact, status: "new", created: now, consent: { at: now, doc: "/consent.html", version: "2026-10-19" } };
    list.push(item);
    await store.setJSON("index", list);
    return json({ ok: true });
  }

  if (!isTeacher(req)) return json({ error: "unauthorized" }, 401);
  const sid = url.searchParams.get("sid") || "";

  if (req.method === "GET") return json({ items: (await readIndex()).slice().reverse() });

  if (req.method === "PATCH") {
    let b; try { b = await req.json(); } catch { return json({ error: "bad json" }, 400); }
    if (!STATUSES.includes(b?.status)) return json({ error: "bad status" }, 400);
    const list = await readIndex(); const it = list.find((x) => x.sid === sid);
    if (!it) return json({ error: "not found" }, 404);
    it.status = b.status; await store.setJSON("index", list);
    return json({ ok: true });
  }

  if (req.method === "DELETE") {
    const list = await readIndex(); const next = list.filter((x) => x.sid !== sid);
    if (next.length === list.length) return json({ error: "not found" }, 404);
    await store.setJSON("index", next);
    return json({ ok: true });
  }

  return json({ error: "method not allowed" }, 405);
};

export const config = { path: "/api/signup" };
