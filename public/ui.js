/* Общие элементы интерфейса: пробники (форма, список, график, слабые задания) и раздатки */
(function(){
"use strict";
const {EXAMS, TRACKS, tone, examMark} = window.EGE;
const slotsOf = exam => EXAMS[exam||"ege"].slots;
const maxOf = exam => EXAMS[exam||"ege"].total;
const examOf = it => it.exam || "ege";

function el(tag, attrs, ...kids){
  const e = document.createElement(tag);
  for (const [k,v] of Object.entries(attrs||{})){
    if (v==null || v===false) continue;
    if (k==="class") e.className = v;
    else if (k==="text") e.textContent = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v===true ? "" : v);
  }
  for (const k of kids.flat()) if (k!=null) e.append(k.nodeType ? k : document.createTextNode(String(k)));
  return e;
}
const total = s => (s||[]).reduce((a,b)=>a+(+b||0), 0);
const fmtDate = d => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d||""); return m ? m[3]+"."+m[2]+"."+m[1] : (d||""); };
const today = () => { const d = new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); };
const plural = (n, one, few, many) => { const a=n%10, b=n%100; return a===1&&b!==11 ? one : a>=2&&a<=4&&(b<12||b>14) ? few : many; };
function fmtSize(b){ return b>=1048576 ? (b/1048576).toFixed(1).replace(".",",")+" МБ" : Math.max(1,Math.round(b/1024))+" КБ"; }

/* ---------- форма пробника ---------- */
function mockForm(box, opts){
  const init = opts.initial || {};
  const exam = init.mid ? examOf(init) : (opts.exam || "ege");
  const SL = slotsOf(exam), MAX = SL.map(s=>s.max), SUM = maxOf(exam);
  const scores = MAX.map((m,i)=> Math.min(m, Math.max(0, +((init.scores||[])[i])||0)));
  box.innerHTML = "";
  const totalOut = el("b", {class:"mform-total"});
  const err = el("div", {class:"err", "aria-live":"polite"});
  const upd = () => { const t = total(scores), m = examMark(exam, t); totalOut.textContent = "Итого: "+t+" из "+SUM+(m ? ", отметка «"+m+"»" : ""); };
  const date = el("input", {type:"date", value: init.date || today(), required:true});
  const title = el("input", {type:"text", maxlength:"80", placeholder: exam.startsWith("vpr") ? "Например, ВПР, тренировочный вариант 2" : "Например, пробник ФИПИ, вариант 3", value: init.title || ""});
  const grid = el("div", {class:"fgrid"+(SL.length<=8 ? " wide" : "")});
  SL.forEach((t,i)=>{
    const id = "sc"+Math.random().toString(36).slice(2,8)+i;
    let ctrl;
    if (MAX[i]===1){
      ctrl = el("input", {type:"checkbox", id, checked: scores[i]===1, onchange: e=>{ scores[i] = e.target.checked?1:0; upd(); }});
      grid.append(el("label", {class:"fcell check", for:id, title:t.t}, el("span", {class:"fn", text:t.n}), ctrl, el("span", {class:"fl", text:"верно"})));
    } else {
      ctrl = el("select", {id, onchange: e=>{ scores[i] = +e.target.value; upd(); }});
      for (let v=0; v<=MAX[i]; v++) ctrl.append(el("option", {value:v, selected: v===scores[i], text:v}));
      grid.append(el("label", {class:"fcell", for:id, title:t.t}, el("span", {class:"fn", text:t.n}), ctrl, el("span", {class:"fl", text:"из "+MAX[i]+(SL.length<=8 ? " · "+t.t : "")})));
    }
  });
  const save = el("button", {class:"btn", type:"submit", text: opts.submitLabel || "Сохранить"});
  const hint = exam==="ege" ? "Отметь задания, решённые верно. За задания 8 и 22 выбери 0–2 балла, за сочинение — 0–22."
    : exam==="oge" ? "Отметь верно решённые задания 2–12. За изложение выбери 0–6 баллов, за сочинение — 0–7, за грамотность — 0–13."
    : "Выбери баллы за каждое задание — их ставят по критериям ВПР. Наведи на номер, чтобы увидеть, что это за задание.";
  const form = el("form", {class:"card mform"},
    el("h3", {class:"mform-title", text: (init.mid ? "Изменить: " : "Новый результат: ")+EXAMS[exam].title}),
    el("div", {class:"mform-head"},
      el("label", {class:"field"}, "Дата", date),
      el("label", {class:"field grow"}, "Название (необязательно)", title)),
    el("p", {class:"small", text: hint}),
    grid,
    el("div", {class:"row mform-foot"}, totalOut, el("span", {class:"grow"}), err,
      el("button", {class:"btn ghost", type:"button", text:"Отмена", onclick: ()=>opts.onCancel && opts.onCancel()}), save));
  form.addEventListener("submit", async e=>{
    e.preventDefault(); err.textContent=""; save.disabled = true;
    try { await opts.onSubmit({mid: init.mid, exam, date: date.value, title: title.value.trim(), scores: scores.slice()}); }
    catch(ex){ err.textContent = ex && ex.message ? ex.message : "Не удалось сохранить. Попробуй ещё раз."; }
    finally { save.disabled = false; }
  });
  upd(); box.append(form); date.focus();
}

/* ---------- список пробников ---------- */
function mockList(box, items, opts){
  box.innerHTML = "";
  if (!items.length){ box.append(el("div", {class:"card empty", text: opts.emptyText || "Пока нет ни одного пробника."})); return; }
  for (const it of items.slice().reverse()){
    const exam = examOf(it), SL = slotsOf(exam), SUM = maxOf(exam);
    const sum = total(it.scores), p = Math.round(sum*100/SUM), tn = tone(p), mark = examMark(exam, sum);
    const cells = el("div", {class:"mgrid"});
    SL.forEach((t,i)=>{
      const m = t.max, v = (it.scores||[])[i]||0, pp = Math.round(v*100/m), ct = tone(pp);
      cells.append(el("div", {class:"mcell", title: t.n+". "+t.t+": "+v+" из "+m, style:"background:var(--"+ct+"-bg);color:var(--"+ct+");border-color:var(--"+ct+")"},
        el("span", {class:"fn", text:t.n}), el("b", {text: m>1 ? v+"/"+m : (v ? "✓" : "✕")})));
    });
    const actions = el("div", {class:"row"});
    if (opts.canEdit && opts.canEdit(it)){
      actions.append(el("button", {class:"btn ghost sm", type:"button", text:"Изменить", onclick: ()=>opts.onEdit(it)}));
      actions.append(el("button", {class:"btn ghost sm", type:"button", text:"Удалить", onclick: ()=>opts.onDelete(it)}));
    }
    const who = EXAMS[exam].title+", "+(it.by==="teacher" ? "внёс учитель" : (opts.studentLabel || "внесено учеником"))+(mark ? ", отметка «"+mark+"»" : "");
    box.append(el("details", {class:"card mock"},
      el("summary", {},
        el("span", {class:"mdate", text: fmtDate(it.date)}),
        el("span", {class:"mtitle"}, el("span", {class:"ttl", text: it.title || "Пробный экзамен"}), el("span", {class:"meta", text: who})),
        el("span", {class:"mtotal", style:"color:var(--"+tn+")"}, sum, el("small", {text:" / "+SUM})),
        el("span", {class:"chev", "aria-hidden":"true", text:"▶"})),
      el("div", {class:"mbody"}, cells, actions)));
  }
}

/* ---------- график итогового балла ---------- */
function chart(box, items, exam){
  box.innerHTML = "";
  const SUM = maxOf(exam);
  if (items.length < 2){ box.append(el("p", {class:"small", text: items.length ? "График появится после второго результата." : "Здесь будет график роста баллов."})); return; }
  const W=Math.max(300, Math.round(box.clientWidth||640)), H=W<500?200:230, L=36, R=20, Tp=24, B=34;
  const xs = i => L + (W-L-R) * (items.length===1 ? .5 : i/(items.length-1));
  const ys = v => Tp + (H-Tp-B) * (1 - v/SUM);
  const ns = "http://www.w3.org/2000/svg";
  const s = document.createElementNS(ns, "svg"); s.setAttribute("viewBox", `0 0 ${W} ${H}`); s.setAttribute("role","img");
  s.setAttribute("aria-label", "Итоговый балл по пробникам: "+items.map(it=>fmtDate(it.date)+" — "+total(it.scores)).join(", "));
  const add = (tag, a, text) => { const e = document.createElementNS(ns, tag); for (const k in a) e.setAttribute(k, a[k]); if (text!=null) e.textContent = text; s.append(e); return e; };
  const step = SUM>30 ? 10 : 5, ticks = []; for (let v=0; v<SUM; v+=step) ticks.push(v); ticks.push(SUM);
  for (const v of ticks){ add("line", {x1:L, x2:W-R, y1:ys(v), y2:ys(v), stroke:"var(--line)", "stroke-width":1}); add("text", {x:L-8, y:ys(v)+4, "text-anchor":"end", "font-size":11, fill:"var(--ink-2)"}, v); }
  const pts = items.map((it,i)=>xs(i)+","+ys(total(it.scores))).join(" ");
  add("polyline", {points:pts, fill:"none", stroke:"var(--accent)", "stroke-width":3, "stroke-linejoin":"round", "stroke-linecap":"round"});
  items.forEach((it,i)=>{
    const v = total(it.scores);
    add("circle", {cx:xs(i), cy:ys(v), r:5, fill:"var(--surface-solid)", stroke:"var(--accent)", "stroke-width":3});
    add("text", {x:xs(i), y:ys(v)-12, "text-anchor":"middle", "font-size":12, "font-weight":700, fill:"var(--ink)"}, v);
    if (items.length<=8 || i===0 || i===items.length-1) add("text", {x:xs(i), y:H-12, "text-anchor":"middle", "font-size":11, fill:"var(--ink-2)"}, fmtDate(it.date).slice(0,5));
  });
  box.append(el("div", {class:"chart"}, s));
}

/* ---------- средний результат по заданиям ---------- */
function taskAverages(box, items, exam, onPick){
  box.innerHTML = "";
  if (!items.length){ box.append(el("p", {class:"small", text:"Появится после первого результата."})); return; }
  const SL = slotsOf(exam);
  const tiles = el("div", {class:"tiles"+(SL.length<=9 ? " few" : "")});
  SL.forEach((t,i)=>{
    let s=0; for (const it of items) s += ((it.scores||[])[i]||0)/t.max;
    const p = Math.round(s*100/items.length), tn = tone(p);
    const b = el(onPick ? "button" : "div", {type: onPick ? "button" : null, class:"tile", "aria-label":"Задание "+t.n+": в среднем "+p+"%", title:t.n+". "+t.t, style:"border-color:var(--"+tn+")", onclick: onPick ? ()=>onPick(t.n) : null},
      el("span", {class:"fill", style:"height:"+p+"%;background:var(--"+tn+"-bg)"}), el("span", {class:"n", text:t.n}), el("span", {class:"p", style:"color:var(--"+tn+")", text:p+"%"}));
    tiles.append(b);
  });
  box.append(tiles);
}

/* ---------- раздатки ---------- */
function filesList(box, items, opts){
  box.innerHTML = "";
  if (!items.length){ box.append(el("div", {class:"card empty", text: opts.emptyText || "Раздаток пока нет."})); return; }
  const groups = {};
  for (const it of items){ (groups[it.topic||"Общее"] = groups[it.topic||"Общее"] || []).push(it); }
  for (const [topic, list] of Object.entries(groups)){
    const ul = el("div", {class:"card flist"});
    for (const it of list){
      const href = it.kind==="file" ? "/api/files?fid="+encodeURIComponent(it.fid) : it.url;
      const ext = it.kind==="file" ? (it.filename.split(".").pop()||"").toUpperCase() : "ССЫЛКА";
      const meta = it.kind==="file" ? fmtSize(it.size)+", добавлено "+new Date(it.uploaded).toLocaleDateString("ru-RU") : "добавлено "+new Date(it.uploaded).toLocaleDateString("ru-RU");
      const row = el("div", {class:"frow"},
        el("span", {class:"fext", text: ext.slice(0,6)}),
        el("span", {class:"grow"}, el("a", {href, target:"_blank", rel:"noopener", class:"ftitle", text: it.title}), el("span", {class:"meta", text: meta})));
      if (opts.who){ row.querySelector(".meta").textContent += " · для: "+opts.who(it); }
      if (opts.onRecipients) row.append(el("button", {class:"btn ghost sm", type:"button", text:"Кому", "aria-label":"Изменить, кому видна: "+it.title, onclick: ()=>opts.onRecipients(it)}));
      if (opts.onDelete) row.append(el("button", {class:"btn ghost sm", type:"button", text:"Удалить", "aria-label":"Удалить: "+it.title, onclick: ()=>opts.onDelete(it)}));
      ul.append(row);
    }
    box.append(el("section", {class:"fgroup"}, el("h3", {text: topic}), ul));
  }
}


/* ---------- читательский дневник ---------- */
const DFIELDS = [
  ["heroes", "Главные герои", "Кто они, какие они"],
  ["summary", "О чём книга", "Коротко: что происходит, чем заканчивается"],
  ["impression", "Мои впечатления", "Что понравилось, что нет, о чём заставила задуматься"],
  ["quote", "Цитата, которая запомнилась", "Можно с номером страницы"],
];
const starText = n => "★".repeat(n) + "☆".repeat(5-n);
function diaryForm(box, opts){
  const init = opts.initial || {};
  box.innerHTML = "";
  const err = el("div", {class:"err", "aria-live":"polite"});
  const title = el("input", {type:"text", maxlength:"150", required:true, value: init.title||"", placeholder:"Например, «Капитанская дочка»"});
  const author = el("input", {type:"text", maxlength:"100", value: init.author||"", placeholder:"Например, А. С. Пушкин"});
  const started = el("input", {type:"date", value: init.started||""});
  const finished = el("input", {type:"date", value: init.finished||""});
  let rating = +init.rating||0;
  const stars = el("div", {class:"stars", role:"radiogroup", "aria-label":"Оценка книги"});
  const paint = () => stars.querySelectorAll("button").forEach((b,i)=>{ b.textContent = i<rating ? "★" : "☆"; b.setAttribute("aria-checked", String(i+1===rating)); });
  for (let i=1;i<=5;i++) stars.append(el("button", {type:"button", role:"radio", "aria-label": i+" из 5", onclick: ()=>{ rating = rating===i ? 0 : i; paint(); }}));
  const areas = {};
  const save = el("button", {class:"btn", type:"submit", text: init.eid ? "Сохранить изменения" : "Добавить в дневник"});
  const form = el("form", {class:"card mform dform"},
    el("h3", {class:"mform-title", text: init.eid ? "Изменить запись" : "Новая книга"}),
    el("div", {class:"mform-head"}, el("label", {class:"field grow"}, "Название *", title), el("label", {class:"field grow"}, "Автор", author)),
    el("div", {class:"mform-head"}, el("label", {class:"field"}, "Начал(а) читать", started), el("label", {class:"field"}, "Дочитал(а)", finished),
      el("div", {class:"field"}, el("span", {text:"Моя оценка"}), stars)),
    DFIELDS.map(([k,label,ph]) => { const t = el("textarea", {rows: k==="quote"||k==="heroes" ? "2" : "4", maxlength: k==="summary"||k==="impression" ? "4000" : "1000", placeholder: ph}); t.value = init[k]||""; areas[k]=t; return el("label", {class:"field"}, label, t); }),
    el("div", {class:"row mform-foot"}, el("span", {class:"grow"}), err,
      el("button", {class:"btn ghost", type:"button", text:"Отмена", onclick: ()=>opts.onCancel && opts.onCancel()}), save));
  paint();
  form.addEventListener("submit", async e=>{
    e.preventDefault(); err.textContent="";
    if (!title.value.trim()){ err.textContent = "Напиши название книги."; title.focus(); return; }
    save.disabled = true;
    const entry = {eid: init.eid, title: title.value.trim(), author: author.value.trim(), started: started.value, finished: finished.value, rating};
    for (const k in areas) entry[k] = areas[k].value;
    try { await opts.onSubmit(entry); }
    catch(ex){ err.textContent = ex && ex.message ? ex.message : "Не удалось сохранить. Попробуй ещё раз."; }
    finally { save.disabled = false; }
  });
  box.append(form); title.focus();
}
function diaryList(box, entries, opts){
  box.innerHTML = "";
  if (!entries.length){ box.append(el("div", {class:"card empty", text: opts.emptyText || "В дневнике пока нет книг."})); return; }
  for (const it of entries){
    const dates = [it.started && fmtDate(it.started), it.finished && fmtDate(it.finished)].filter(Boolean).join(" — ");
    const meta = [it.author, dates].filter(Boolean).join(" · ");
    const body = el("div", {class:"mbody dbody"});
    for (const [k,label] of DFIELDS) if ((it[k]||"").trim()) body.append(el("div", {class:"dsec"}, el("div", {class:"dlabel", text:label}), el("div", {class:"dtext", text:it[k]})));
    if (!body.childNodes.length) body.append(el("p", {class:"small", text:"Пока заполнено только название."}));
    if (opts.onComment){
      const ta = el("textarea", {rows:"3", maxlength:"2000", placeholder:"Ваш комментарий ученику"}); ta.value = it.teacherComment||"";
      const msg = el("span", {class:"small", "aria-live":"polite"});
      body.append(el("div", {class:"tcomment"}, el("label", {class:"field"}, "Комментарий учителя", ta),
        el("div", {class:"row"}, el("button", {class:"btn sm", type:"button", text:"Сохранить комментарий", onclick: async ()=>{ msg.textContent="Сохраняю…"; try { await opts.onComment(it, ta.value); msg.textContent="Сохранено"; } catch(e){ msg.textContent="Не удалось сохранить"; } }}), msg)));
    } else if ((it.teacherComment||"").trim()){
      body.append(el("div", {class:"tcomment"}, el("div", {class:"dlabel", text:"Комментарий учителя"}), el("div", {class:"dtext", text:it.teacherComment})));
    }
    const actions = el("div", {class:"row"});
    if (opts.canEdit && opts.canEdit(it)){
      actions.append(el("button", {class:"btn ghost sm", type:"button", text:"Изменить", onclick: ()=>opts.onEdit(it)}));
      actions.append(el("button", {class:"btn ghost sm", type:"button", text:"Удалить", onclick: ()=>opts.onDelete(it)}));
    }
    if (actions.childNodes.length) body.append(actions);
    box.append(el("details", {class:"card mock"},
      el("summary", {class:"dsum"},
        el("span", {class:"mdate", text: it.finished ? fmtDate(it.finished) : "читаю"}),
        el("span", {class:"mtitle"}, el("span", {class:"ttl", text: it.title}), el("span", {class:"meta", text: meta || "автор и даты не указаны"})),
        el("span", {class:"dstars", "aria-label": it.rating ? "Оценка "+it.rating+" из 5" : "Без оценки", text: it.rating ? starText(it.rating) : ""}),
        (it.teacherComment||"").trim() && !opts.onComment ? el("span", {class:"chip", text:"есть комментарий"}) : el("span", {}),
        el("span", {class:"chev", "aria-hidden":"true", text:"▶"})),
      body));
  }
}

/* ---------- домашние задания ---------- */
function dueInfo(due){
  if (!due) return {text:"без срока", tone:"violet", days:Infinity};
  const t = new Date(); t.setHours(0,0,0,0);
  const d = new Date(due+"T00:00:00"); const days = Math.round((d - t)/86400000);
  const date = fmtDate(due).slice(0,5);
  if (days < 0) return {text:"до "+date+" — просрочено на "+(-days)+" "+plural(-days,"день","дня","дней"), tone:"pink", days};
  if (days === 0) return {text:"до "+date+" — сегодня", tone:"orange", days};
  if (days === 1) return {text:"до "+date+" — завтра", tone:"orange", days};
  return {text:"до "+date+" — через "+days+" "+plural(days,"день","дня","дней"), tone: days<=3 ? "orange" : "sky", days};
}
function hwBody(it){
  const box = el("div", {class:"hwbody"});
  if ((it.text||"").trim()) box.append(el("div", {class:"dtext", text: it.text}));
  const items = [];
  const row = (badge, href, label) => el("a", {href, target:"_blank", rel:"noopener", class:"hwlink"}, el("span", {class:"fext", text:badge}), el("span", {text:label}));
  for (const l of it.links||[]) items.push(row("ССЫЛКА", l.url, l.title||l.url));
  for (const f of it.files||[]) items.push(row((f.filename.split(".").pop()||"файл").toUpperCase().slice(0,5), "/api/homework?file="+encodeURIComponent(f.fid), f.filename+(f.size ? " · "+fmtSize(f.size) : "")));
  if (items.length) box.append(el("div", {class:"hwlinks"}, items));
  return box;
}
function hwTitle(it){ return (it.title||"").trim() || "Задание от "+new Date(it.created).toLocaleDateString("ru-RU"); }

window.EGE.ui = {el, total, fmtDate, today, plural, slotsOf, maxOf, examOf, mockForm, mockList, chart, taskAverages, filesList, diaryForm, diaryList, dueInfo, hwBody, hwTitle, fmtSize};
})();
