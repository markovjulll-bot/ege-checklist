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
      if (opts.showTracks){ const tl = (it.tracks&&it.tracks.length) ? it.tracks.map(t=>TRACKS[t] ? TRACKS[t].title : t).join(", ") : "все версии"; row.querySelector(".meta").textContent += " · для: "+tl; }
      if (opts.onDelete) row.append(el("button", {class:"btn ghost sm", type:"button", text:"Удалить", "aria-label":"Удалить: "+it.title, onclick: ()=>opts.onDelete(it)}));
      ul.append(row);
    }
    box.append(el("section", {class:"fgroup"}, el("h3", {text: topic}), ul));
  }
}

window.EGE.ui = {el, total, fmtDate, today, plural, slotsOf, maxOf, examOf, mockForm, mockList, chart, taskAverages, filesList};
})();
