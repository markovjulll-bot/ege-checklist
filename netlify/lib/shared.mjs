// Общие помощники для функций
export const ID = /^[A-Z2-9]{8}$/;
// Максимальный балл за каждое задание — совпадает с EXAMS в public/tasks.js
// ЕГЭ — 50, ОГЭ — 37 (последний слот — грамотность), ВПР 6 — 25, ВПР 7 — 23
export const EXAM_MAX = {"ege": [1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 22], "oge": [6, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 7, 13], "vpr6": [9, 9, 2, 3, 2], "vpr7": [9, 2, 3, 3, 2, 2, 2]};
export const TRACKS = ["ege", "oge", "school"];
export const GRADES = [6, 7, 8, 9, 10, 11];

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

export function isTeacher(req) {
  const pin = Netlify.env.get("TEACHER_PIN") || "";
  const got = req.headers.get("x-teacher-pin") || "";
  if (!pin || got.length !== pin.length) return false;
  let diff = 0;
  for (let i = 0; i < pin.length; i++) diff |= pin.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}

const ALPH = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function newId(len = 8) {
  const a = new Uint8Array(len);
  crypto.getRandomValues(a);
  let s = "";
  for (const b of a) s += ALPH[b % ALPH.length];
  return s;
}

export const clean = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
