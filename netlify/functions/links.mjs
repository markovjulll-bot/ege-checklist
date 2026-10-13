// Быстрые ссылки учителя: доски, тренажёры и другие сайты, которые нужно открывать одним нажатием.
// Учитель (x-teacher-pin):
//   GET /api/links  — список ссылок (если учитель ещё ничего не сохранял — набор по умолчанию)
//   PUT /api/links  — сохранить список [{title, url}]
import { getStore } from "@netlify/blobs";
import { json, isTeacher, clean } from "../lib/shared.mjs";

export const DEFAULT_LINKS = [
  { title: "Miro", url: "https://miro.com/app/dashboard/" },
  { title: "Холст", url: "https://holst.so/" },
  { title: "Решу ЕГЭ", url: "https://rus-ege.sdamgia.ru/" },
  { title: "Решу ОГЭ", url: "https://rus-oge.sdamgia.ru/" },
];

export function cleanLinks(v) {
  const out = [];
  for (const raw of Array.isArray(v) ? v : []) {
    let s = String(raw?.url || "").trim();
    if (s && !/^[a-z]+:\/\//i.test(s)) s = "https://" + s;
    try {
      const u = new URL(s);
      if (/^https?:$/.test(u.protocol)) out.push({ title: clean(raw?.title, 60) || u.hostname.replace(/^www\./, ""), url: u.href });
    } catch {}
  }
  return out.slice(0, 30);
}

export default async (req) => {
  if (!isTeacher(req)) return json({ error: "unauthorized" }, 401);
  const store = getStore({ name: "ege-links", consistency: "strong" });

  if (req.method === "GET") {
    const saved = await store.get("teacher", { type: "json" });
    return json({ links: saved ? saved.links : DEFAULT_LINKS, saved: !!saved });
  }

  if (req.method === "PUT") {
    let b; try { b = await req.json(); } catch { return json({ error: "bad json" }, 400); }
    const links = cleanLinks(b?.links);
    await store.setJSON("teacher", { links, updated: new Date().toISOString() });
    return json({ ok: true, links });
  }

  return json({ error: "method not allowed" }, 405);
};

export const config = { path: "/api/links" };
