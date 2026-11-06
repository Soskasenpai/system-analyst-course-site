// Проверка файла уроков:  node tools/validate-lessons.js assets/lessons/m0.js [m1.js ...]
// Проверяет синтаксис, структуру, индексы ответов, регулярки и объём уроков.
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
global.window = {};
require(path.join(root, "assets", "content.js"));
const modules = window.COURSE.modules;
const known = {};
modules.forEach(m => m.topics.forEach(t => (known[t.id] = m.id)));

let errors = 0;
const err = (id, msg) => { errors++; console.log(`  ✗ ${id}: ${msg}`); };

for (const f of process.argv.slice(2)) {
  window.LESSONS = {};
  const file = path.resolve(f);
  console.log(f);
  try { require(file); } catch (e) { err(f, "синтаксическая ошибка: " + e.message); continue; }
  const L = window.LESSONS;
  const ids = Object.keys(L);
  const mods = new Set(ids.map(i => known[i]));
  mods.forEach(mid => {
    const need = modules.find(m => m.id === mid).topics.map(t => t.id);
    need.filter(i => !L[i]).forEach(i => err(i, "нет урока для топика"));
  });
  for (const id of ids) {
    const l = L[id];
    if (!known[id]) { err(id, "неизвестный id топика"); continue; }
    if (!l.title) err(id, "нет title");
    const words = (l.body || "").split(/\s+/).length;
    if (words < 180) err(id, `короткий урок (${words} слов, нужно ≥180)`);
    if (words > 600) err(id, `слишком длинный урок (${words} слов, нужно ≤600)`);
    if (!Array.isArray(l.q) || l.q.length < 3) { err(id, "нужно ≥3 задания"); continue; }
    l.q.forEach((q, i) => {
      const w = `${id}/q${i + 1}`;
      if (!q.q) err(w, "нет текста вопроса");
      if (q.t === "single") {
        if (!Array.isArray(q.o) || q.o.length < 3) err(w, "нужно ≥3 варианта");
        else if (!Number.isInteger(q.a) || q.a < 0 || q.a >= q.o.length) err(w, "a вне диапазона");
        if (!q.e) err(w, "нет объяснения e");
      } else if (q.t === "multi") {
        if (!Array.isArray(q.o) || q.o.length < 4) err(w, "нужно ≥4 варианта");
        else if (!Array.isArray(q.a) || q.a.length < 2 || q.a.some(x => x < 0 || x >= q.o.length)) err(w, "a должен быть массивом ≥2 индексов в диапазоне");
        if (!q.e) err(w, "нет объяснения e");
      } else if (q.t === "short") {
        if (!Array.isArray(q.a) || !q.a.length) err(w, "нет a (массив regex)");
        else q.a.forEach(r => { try { new RegExp(r, "i"); } catch (e) { err(w, "плохая regex " + r); } });
        if (!q.sample) err(w, "нет sample (эталонный ответ)");
      } else if (q.t === "task") {
        if (!Array.isArray(q.rubric) || q.rubric.length < 3) err(w, "нужен rubric ≥3 пунктов");
        if (!q.sample) err(w, "нет sample");
      } else err(w, "неизвестный t: " + q.t);
    });
    const kinds = new Set(l.q.map(q => q.t));
    if (!kinds.has("single") && !kinds.has("multi")) err(id, "нужен хотя бы один single/multi");
  }
  console.log(`  уроков: ${ids.length}`);
}
console.log(errors ? `\nОшибок: ${errors}` : "\nOK");
process.exit(errors ? 1 : 0);
