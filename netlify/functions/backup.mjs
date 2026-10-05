// Резервная копия всех данных: для переезда на другой хостинг и на всякий случай.
// GET  /api/backup  — скачать копию (учитель, x-teacher-pin)
// POST /api/backup  — загрузить копию: данные объединяются с уже имеющимися
// В копию входят ученики, отметки, пробники, дневники, домашние задания и ссылки-раздатки.
// Файлы раздаток в копию не входят — их нужно загрузить заново.
import { getStore } from "@netlify/blobs";
import { ID, json, isTeacher } from "../lib/shared.mjs";

const stores = () => ({
  progress: getStore({ name: "ege-progress", consistency: "strong" }),
  mocks: getStore({ name: "ege-mocks", consistency: "strong" }),
  files: getStore({ name: "ege-files", consistency: "strong" }),
  diary: getStore({ name: "ege-diary", consistency: "strong" }),
  homework: getStore({ name: "ege-homework", consistency: "strong" }),
});

async function all(store) {
  const { blobs } = await store.list();
  return (await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })))).filter(Boolean);
}

export default async (req) => {
  if (!isTeacher(req)) return json({ error: "unauthorized" }, 401);
  const s = stores();

  if (req.method === "GET") {
    const files = (await s.files.get("index", { type: "json" })) || [];
    return new Response(JSON.stringify({
      kind: "ege-cabinet-backup", version: 1, exported: new Date().toISOString(),
      progress: await all(s.progress), mocks: await all(s.mocks), diary: await all(s.diary), files,
      homework: await (async () => {
        const index = (await s.homework.get("index", { type: "json" })) || [];
        const { blobs } = await s.homework.list({ prefix: "s/" });
        const status = {};
        for (const b of blobs) status[b.key.slice(2)] = (await s.homework.get(b.key, { type: "json" })) || {};
        return { index, status };
      })(),
    }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="kabinet-backup-${new Date().toISOString().slice(0, 10)}.json"` } });
  }

  if (req.method === "POST") {
    let b;
    try { b = await req.json(); } catch { return json({ error: "bad json" }, 400); }
    if (b?.kind !== "ege-cabinet-backup") return json({ error: "not a backup" }, 400);
    const res = { progress: 0, mocks: 0, diary: 0, homework: 0, links: 0, filesToReupload: 0 };

    for (const p of Array.isArray(b.progress) ? b.progress : []) {
      if (!ID.test(p?.id || "")) continue;
      const cur = await s.progress.get(p.id, { type: "json" });
      if (cur && (Date.parse(cur.updated) || 0) > (Date.parse(p.updated) || 0)) continue;
      await s.progress.setJSON(p.id, p); res.progress++;
    }
    for (const m of Array.isArray(b.mocks) ? b.mocks : []) {
      if (!ID.test(m?.id || "") || !Array.isArray(m.items)) continue;
      const cur = (await s.mocks.get(m.id, { type: "json" })) || { id: m.id, items: [] };
      const have = new Set(cur.items.map((x) => x.mid));
      for (const it of m.items) if (it?.mid && !have.has(it.mid)) { cur.items.push(it); res.mocks++; }
      cur.items.sort((a, c) => (a.date < c.date ? -1 : a.date > c.date ? 1 : 0));
      await s.mocks.setJSON(m.id, cur);
    }
    for (const d of Array.isArray(b.diary) ? b.diary : []) {
      if (!ID.test(d?.id || "") || !Array.isArray(d.entries)) continue;
      const cur = (await s.diary.get(d.id, { type: "json" })) || { id: d.id, entries: [] };
      const have = new Set(cur.entries.map((x) => x.eid));
      for (const it of d.entries) if (it?.eid && !have.has(it.eid)) { cur.entries.push(it); res.diary++; }
      await s.diary.setJSON(d.id, cur);
    }
    if (b.homework && Array.isArray(b.homework.index)) {
      const hidx = (await s.homework.get("index", { type: "json" })) || [];
      const have = new Set(hidx.map((h) => h.hid));
      for (const h of b.homework.index) if (h?.hid && !have.has(h.hid)) {
        if (h.files?.length) res.filesToReupload += h.files.length;
        hidx.push({ ...h, files: [] }); res.homework++;
      }
      await s.homework.setJSON("index", hidx);
      for (const [sid, st] of Object.entries(b.homework.status || {})) {
        if (!ID.test(sid)) continue;
        const cur = (await s.homework.get("s/" + sid, { type: "json" })) || {};
        await s.homework.setJSON("s/" + sid, { ...st, ...cur });
      }
    }
    const index = (await s.files.get("index", { type: "json" })) || [];
    const haveF = new Set(index.map((x) => x.fid));
    for (const f of Array.isArray(b.files) ? b.files : []) {
      if (f?.kind === "link" && !haveF.has(f.fid)) { index.push(f); res.links++; }
      else if (f?.kind === "file" && !haveF.has(f.fid)) res.filesToReupload++;
    }
    await s.files.setJSON("index", index);
    return json({ ok: true, ...res });
  }

  return json({ error: "method not allowed" }, 405);
};

export const config = { path: "/api/backup" };
