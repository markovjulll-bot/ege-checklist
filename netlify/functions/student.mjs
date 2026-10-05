// Полное удаление ученика (учитель, x-teacher-pin):
// DELETE /api/student?id=CODE — убирает отметки, результаты, дневник, отметки по ДЗ
// и убирает ученика из списков получателей раздаток и заданий.
import { getStore } from "@netlify/blobs";
import { ID, json, isTeacher } from "../lib/shared.mjs";

export default async (req) => {
  if (!isTeacher(req)) return json({ error: "unauthorized" }, 401);
  if (req.method !== "DELETE") return json({ error: "method not allowed" }, 405);
  const id = (new URL(req.url).searchParams.get("id") || "").toUpperCase();
  if (!ID.test(id)) return json({ error: "bad id" }, 400);
  const st = (name) => getStore({ name, consistency: "strong" });
  await st("ege-progress").delete(id);
  await st("ege-mocks").delete(id);
  await st("ege-diary").delete(id);
  const hw = st("ege-homework");
  await hw.delete("s/" + id);
  const hidx = (await hw.get("index", { type: "json" })) || [];
  let changed = false;
  for (const h of hidx) if (h.students?.includes(id)) { h.students = h.students.filter((x) => x !== id); changed = true; }
  if (changed) await hw.setJSON("index", hidx.filter((h) => h.students.length));
  const files = st("ege-files");
  const fidx = (await files.get("index", { type: "json" })) || [];
  changed = false;
  for (const f of fidx) if (Array.isArray(f.students) && f.students.includes(id)) { f.students = f.students.filter((x) => x !== id); changed = true; }
  if (changed) await files.setJSON("index", fidx);
  return json({ ok: true });
};

export const config = { path: "/api/student" };
