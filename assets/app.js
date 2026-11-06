(function () {
  "use strict";
  var C = window.COURSE;
  var $ = function (s) { return document.querySelector(s); };

  /* ---------- данные ---------- */
  var GROUPS = [
    ["A. Старт", ["m0", "m1"]],
    ["B. Мышление и требования", ["m2", "m3", "m4"]],
    ["C. Проектирование системы", ["m5", "m6", "m7"]],
    ["D. Интеграции", ["m8", "m9", "m10"]],
    ["E. Современность", ["m11", "m12"]],
    ["F. Финал", ["m13", "m14"]]
  ];
  var LINKS = {
    "00_План_обучения.md": "#/plan", "01_Актуальное_для_2027.md": "#/actual",
    "02_Топики.md": "#/topics", "03_Конспект_Клименко.md": "#/klimenko"
  };
  var byId = {};
  C.modules.forEach(function (m) { byId[m.id] = m; });

  /* ---------- прогресс ---------- */
  var done = {};   // модули без уроков: ручная отметка
  var prog = {};   // prog[topicId][qIndex] = true — задание засчитано
  var drafts = {}; // черновики ответов на открытые задания
  try { done = JSON.parse(localStorage.getItem("sa-done") || "{}"); } catch (e) {}
  try { prog = JSON.parse(localStorage.getItem("sa-prog") || "{}"); } catch (e) {}
  try { drafts = JSON.parse(localStorage.getItem("sa-drafts") || "{}"); } catch (e) {}
  function save() {
    try {
      localStorage.setItem("sa-done", JSON.stringify(done));
      localStorage.setItem("sa-prog", JSON.stringify(prog));
      localStorage.setItem("sa-drafts", JSON.stringify(drafts));
    } catch (e) {}
  }
  var saveDone = save;

  /* ---------- уроки ---------- */
  var LES = window.LESSONS || {};
  function lesson(tid) { return LES[tid]; }

  // Варианты ответов авторы пишут с перекосом в одну позицию, поэтому
  // перемешиваем их детерминированно (порядок не меняется при перезагрузке).
  function rng(seed) {
    var h = 1779033703 ^ seed.length;
    for (var i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16;
      return (h >>> 0) / 4294967296;
    };
  }
  var prepCache = {};
  function prepared(tid) {
    if (prepCache[tid]) return prepCache[tid];
    var l = lesson(tid), out = { title: l.title, body: l.body, q: l.q.map(function (q, i) {
      if (!q.o) return q;
      var r = rng(tid + "/" + i), order = q.o.map(function (_, k) { return k; });
      for (var k = order.length - 1; k > 0; k--) { var j = Math.floor(r() * (k + 1)), t = order[k]; order[k] = order[j]; order[j] = t; }
      var pos = {}; order.forEach(function (orig, nw) { pos[orig] = nw; });
      var c = {}; for (var key in q) c[key] = q[key];
      c.o = order.map(function (orig) { return q.o[orig]; });
      c.a = q.t === "single" ? pos[q.a] : q.a.map(function (x) { return pos[x]; });
      return c;
    }) };
    return (prepCache[tid] = out);
  }
  function topicDone(tid) {
    var l = lesson(tid); if (!l) return false;
    var p = prog[tid] || {};
    return l.q.every(function (_, i) { return p[i]; });
  }
  function modTopics(m) { return m.topics.filter(function (t) { return lesson(t.id); }); }
  function modDone(m) {
    var ts = modTopics(m);
    if (!ts.length) return !!done[m.id];
    return ts.every(function (t) { return topicDone(t.id); });
  }

  /* ---------- Markdown ---------- */
  function esc(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  function inline(s) {
    var codes = [];
    s = esc(s).replace(/`([^`]+)`/g, function (_, c) { codes.push(c); return "\u0000" + (codes.length - 1) + "\u0000"; });
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (_, t, u) {
      u = u.replace(/&amp;/g, "&");
      if (LINKS[decodeURIComponent(u)]) return '<a href="' + LINKS[decodeURIComponent(u)] + '">' + t + "</a>";
      return '<a href="' + u + '" target="_blank" rel="noopener">' + t + "</a>";
    });
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/(^|[\s(>«„"—])\*([^*\s][^*]*?)\*(?=[\s).,;:!?<»"“—]|$)/g, "$1<em>$2</em>");
    return s.replace(/\u0000(\d+)\u0000/g, function (_, i) { return "<code>" + codes[+i] + "</code>"; });
  }

  var LABEL = { "Цель": "", "Аналогия": "", "Ошибки": "err", "Практика": "prac", "Тест": "" };

  function para(lines) {
    return lines.map(function (l) {
      var m = /^(Цель|Аналогия|Ошибки|Практика|Тест):\s*(.*)$/.exec(l);
      if (m) return '<div class="note ' + LABEL[m[1]] + '"><b>' + m[1] + ":</b> " + inline(m[2]) + "</div>";
      return "<p>" + inline(l) + "</p>";
    }).join("");
  }

  function cells(row) { return row.trim().replace(/^\||\|$/g, "").split("|").map(function (c) { return c.trim(); }); }

  function list(lines) {
    // lines: {indent, ordered, text}
    var html = "", stack = [];
    lines.forEach(function (it) {
      var tag = it.ordered ? "ol" : "ul";
      while (stack.length && it.indent < stack[stack.length - 1].indent) { html += "</li></" + stack.pop().tag + ">"; }
      if (!stack.length || it.indent > stack[stack.length - 1].indent) {
        html += "<" + tag + "><li>"; stack.push({ indent: it.indent, tag: tag });
      } else { html += "</li><li>"; }
      html += inline(it.text);
    });
    while (stack.length) html += "</li></" + stack.pop().tag + ">";
    return html;
  }

  function md(src) {
    var L = src.split("\n"), out = [], i = 0, m;
    while (i < L.length) {
      var l = L[i];
      if (!l.trim()) { i++; continue; }
      if ((m = /^(~~~|```)\s*(\w*)\s*$/.exec(l))) {
        var fence = m[1], code = []; i++;
        while (i < L.length && L[i].indexOf(fence) !== 0) { code.push(L[i]); i++; }
        i++;
        out.push('<pre class="code"' + (m[2] ? ' data-lang="' + m[2] + '"' : "") + "><code>" + esc(code.join("\n")) + "</code></pre>");
        continue;
      }
      if ((m = /^(#{1,4})\s+(.*)$/.exec(l))) { out.push("<h" + m[1].length + ">" + inline(m[2]) + "</h" + m[1].length + ">"); i++; continue; }
      if (/^---+\s*$/.test(l)) { out.push("<hr>"); i++; continue; }
      if (/^\|/.test(l) && /^\|?\s*:?-{2,}/.test(L[i + 1] || "")) {
        var head = cells(l), rows = []; i += 2;
        while (i < L.length && /^\|/.test(L[i])) { rows.push(cells(L[i])); i++; }
        out.push('<div class="table-wrap"><table><thead><tr>' + head.map(function (h) { return "<th>" + inline(h) + "</th>"; }).join("") +
          "</tr></thead><tbody>" + rows.map(function (r) { return "<tr>" + r.map(function (c) { return "<td>" + inline(c) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div>");
        continue;
      }
      if (/^\s*>/.test(l)) {
        var q = [];
        while (i < L.length && /^\s*>/.test(L[i])) { q.push(L[i].replace(/^\s*>\s?/, "")); i++; }
        out.push("<blockquote>" + para(q) + "</blockquote>"); continue;
      }
      if (/^\s*([-*]|\d+\.)\s+/.test(l)) {
        var items = [];
        while (i < L.length && (m = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(L[i]))) {
          items.push({ indent: m[1].length, ordered: /\d/.test(m[2]), text: m[3] }); i++;
        }
        out.push(list(items)); continue;
      }
      var p = [];
      while (i < L.length && L[i].trim() && !/^(#{1,4}\s|---+\s*$|\||\s*>|\s*([-*]|\d+\.)\s+)/.test(L[i])) { p.push(L[i]); i++; }
      if (!p.length) { p.push(L[i]); i++; }
      out.push(para(p));
    }
    return out.join("\n");
  }

  /* ---------- вспомогательное ---------- */
  function doneCount() { return C.modules.filter(modDone).length; }
  function lessonStats() {
    var n = 0, d = 0;
    C.modules.forEach(function (m) { modTopics(m).forEach(function (t) { n++; if (topicDone(t.id)) d++; }); });
    return { n: n, d: d };
  }
  function shortTitle(m) { return m.title.replace(/^M\d+\.\s*/, ""); }

  var navRoute = "#/";
  /* ---------- навигация ---------- */
  function buildNav(route) {
    var n = doneCount(), total = C.modules.length, st = lessonStats();
    var pct = st.n ? Math.round(st.d / st.n * 100) : 0;
    var h = '<div class="progress"><div class="bar"><i style="width:' + pct + '%"></i></div><small>Уроков: ' + st.d + " из " + st.n + " · модулей: " + n + " из " + total + "</small></div>";
    function a(href, label, code, tick) {
      return '<a href="' + href + '"' + (route === href ? ' class="active"' : "") + ">" + (code ? '<span class="code">' + code + "</span>" : "") + "<span>" + label + "</span>" + (tick ? '<span class="tick">✓</span>' : "") + "</a>";
    }
    h += "<h4>КУРС</h4>" + a("#/", "Главная") + a("#/plan", "План обучения") + a("#/actual", "Актуальное для 2027");
    GROUPS.forEach(function (g) {
      h += "<h4>" + g[0].toUpperCase() + "</h4>";
      g[1].forEach(function (id) { var m = byId[id]; if (m) h += a("#/m/" + id, esc(shortTitle(m)), m.code, modDone(m)); });
    });
    h += "<h4>МАТЕРИАЛЫ</h4>" + a("#/klimenko", "Конспект Клименко") + a("#/topics", "Все топики");
    $("#nav").innerHTML = h;
  }

  /* ---------- страницы ---------- */
  function page(html) { return '<article class="content">' + html + "</article>"; }

  function home() {
    var h = '<section class="hero"><h1>Системный аналитик с нуля</h1>' +
      "<p>16 недель, около 180 часов. Теория и практика для тех, кто ни разу не работал в IT. На выходе — портфолио из трёх артефактов и готовность к собеседованию на Junior.</p>" +
      '<a class="btn" href="#/m/m0">Начать с M0</a> <a class="btn" style="background:var(--accent-soft);color:var(--accent)" href="#/plan">План курса</a>' +
      '<div class="stats"><div class="stat"><b>16</b><span>недель</span></div><div class="stat"><b>15</b><span>модулей</span></div><div class="stat"><b>~180</b><span>часов</span></div><div class="stat"><b>60/40</b><span>практика / теория</span></div></div></section>';
    GROUPS.forEach(function (g) {
      h += '<div class="group-title">' + g[0].toUpperCase() + '</div><div class="cards">';
      g[1].forEach(function (id) {
        var m = byId[id]; if (!m) return;
        var ts = modTopics(m), dn = ts.filter(function (t) { return topicDone(t.id); }).length;
        h += '<a class="card' + (modDone(m) ? " done" : "") + '" href="#/m/' + id + '"><div class="code">' + m.code + (modDone(m) ? " ✓" : "") + '</div><div class="t">' + esc(shortTitle(m)) + '</div><div class="w">' + (m.week || "") + (ts.length ? " · уроков " + dn + "/" + ts.length : "") + "</div></a>";
      });
      h += "</div>";
    });
    return '<div class="content" style="max-width:960px">' + h + "</div>";
  }

  function modulePage(id) {
    var m = byId[id]; if (!m) return notFound();
    var idx = C.modules.indexOf(m), prev = C.modules[idx - 1], next = C.modules[idx + 1];
    var meta = [m.week, m.source ? "Источник: " + m.source : ""].filter(Boolean).join(" · ");
    var body = md(m.md).replace(/^<h1>.*?<\/h1>/, "");
    var ts = modTopics(m);
    var h = "<h1>" + esc(m.title) + "</h1>" + (meta ? '<div class="meta">' + esc(meta) + "</div>" : "");
    if (ts.length) {
      h += "<h2>Уроки</h2><div class=\"lessons\">" + m.topics.map(function (t) {
        var ok = lesson(t.id);
        return ok ? '<a class="lesson' + (topicDone(t.id) ? " done" : "") + '" href="#/m/' + id + "/" + t.id + '"><span class="n">' + t.id + "</span><span>" + esc(ok.title) + "</span><span class=\"s\">" + (topicDone(t.id) ? "✓" : lessonProgress(t.id)) + "</span></a>"
          : '<span class="lesson soon"><span class="n">' + t.id + "</span><span>" + esc(t.desc.split(/[.:]/)[0]) + '</span><span class="s">скоро</span></span>';
      }).join("") + "</div>";
      h += "<details class=\"program\"><summary>Программа модуля (практика и мини-тест)</summary>" + body + "</details>";
    } else {
      h += body + '<button class="done-btn' + (done[id] ? " on" : "") + '" id="doneBtn">' + (done[id] ? "✓ Модуль пройден" : "Отметить пройденным") + "</button>";
    }
    h += '<div class="pager">' +
      (prev ? '<a href="#/m/' + prev.id + '"><small>← Назад</small>' + esc(prev.title) + "</a>" : "<span></span>") +
      (next ? '<a href="#/m/' + next.id + '"><small>Дальше →</small>' + esc(next.title) + "</a>" : "<span></span>") + "</div>";
    return page(h);
  }

  function lessonProgress(tid) {
    var p = prog[tid] || {}, n = Object.keys(p).length;
    return n ? n + "/" + lesson(tid).q.length : "";
  }

  var QTYPE = { single: "один ответ", multi: "несколько ответов", short: "короткий ответ", task: "практика" };

  function quizHtml(tid, l) {
    return l.q.map(function (q, i) {
      var b = "";
      if (q.t === "single" || q.t === "multi") {
        b = '<div class="opts">' + q.o.map(function (o, k) {
          return '<label class="opt"><input type="' + (q.t === "single" ? "radio" : "checkbox") + '" name="q' + i + '" value="' + k + '"><span>' + inline(o) + "</span></label>";
        }).join("") + "</div>";
      } else if (q.t === "short") {
        b = '<input class="ans" type="text" placeholder="Ваш ответ" autocomplete="off">';
      } else {
        b = '<textarea class="ans" rows="5" placeholder="Напишите ответ здесь (черновик сохраняется в браузере)">' + esc((drafts[tid + "/" + i]) || "") + '</textarea><div class="task-extra" hidden></div>';
      }
      var btn = q.t === "task" ? '<button class="qbtn" data-act="reveal">Показать эталон и критерии</button>' : '<button class="qbtn" data-act="check">Проверить</button>';
      return '<div class="q" data-i="' + i + '"><div class="qh"><span class="qn">Задание ' + (i + 1) + '</span><span class="qtype">' + QTYPE[q.t] + '</span></div><div class="qt">' + inline(q.q) + "</div>" + b + '<div class="qa">' + btn + '</div><div class="fb"></div></div>';
    }).join("");
  }

  function answerText(q) {
    if (q.t === "single") return "Правильный ответ: <b>" + inline(q.o[q.a]) + "</b>";
    if (q.t === "multi") return "Правильные ответы: <b>" + q.a.map(function (k) { return inline(q.o[k]); }).join("; ") + "</b>";
    if (q.t === "short") return "Пример ответа: <b>" + inline(q.sample) + "</b>";
    return "";
  }
  function explain(q) { return (q.e ? "<div class=\"ex\">" + inline(q.e) + "</div>" : ""); }

  function bindQuiz(tid, l) {
    var root = $("#quiz"); if (!root) return;
    function refresh() {
      var st = $("#topicState"), ok = topicDone(tid);
      if (st) { st.className = "topic-state" + (ok ? " ok" : ""); st.textContent = ok ? "✓ Урок пройден" : "Выполнено заданий: " + Object.keys(prog[tid] || {}).length + " из " + l.q.length; }
      buildNav(navRoute);
    }
    function pass(i, el) {
      prog[tid] = prog[tid] || {}; prog[tid][i] = true; save();
      el.classList.add("passed"); el.querySelectorAll("input,textarea,button[data-act=check]").forEach(function (x) { if (x.type !== "checkbox" || !x.closest(".task-extra")) x.disabled = true; });
      refresh();
    }
    l.q.forEach(function (q, i) {
      var el = root.querySelector('.q[data-i="' + i + '"]'), fb = el.querySelector(".fb");
      var fails = 0;
      if (prog[tid] && prog[tid][i]) {
        el.classList.add("passed");
        fb.innerHTML = '<div class="good">✓ Засчитано</div>' + (q.t === "task" ? "" : explain(q));
        el.querySelectorAll("input,textarea").forEach(function (x) { x.disabled = true; });
        var b0 = el.querySelector(".qbtn"); if (b0) b0.disabled = true;
        if (q.t === "single") { var r0 = el.querySelector('input[value="' + q.a + '"]'); if (r0) r0.checked = true; }
        if (q.t === "multi") q.a.forEach(function (k) { var c = el.querySelector('input[value="' + k + '"]'); if (c) c.checked = true; });
        if (q.t === "short") el.querySelector(".ans").value = "✓ " + q.sample;
        return;
      }
      if (q.t === "task") {
        var ta = el.querySelector("textarea");
        ta.addEventListener("input", function () { drafts[tid + "/" + i] = ta.value; save(); });
      }
      el.querySelector(".qbtn").addEventListener("click", function () {
        if (q.t === "task") { revealTask(q, el, i, tid, pass); return; }
        var ok = false;
        if (q.t === "single") { var s = el.querySelector("input:checked"); if (!s) { fb.innerHTML = '<div class="bad">Выберите вариант.</div>'; return; } ok = +s.value === q.a; }
        else if (q.t === "multi") {
          var sel = Array.prototype.map.call(el.querySelectorAll("input:checked"), function (x) { return +x.value; }).sort();
          if (!sel.length) { fb.innerHTML = '<div class="bad">Выберите варианты.</div>'; return; }
          ok = sel.length === q.a.length && q.a.slice().sort().every(function (v, k) { return v === sel[k]; });
        } else {
          var v = el.querySelector(".ans").value.trim();
          if (!v) { fb.innerHTML = '<div class="bad">Введите ответ.</div>'; return; }
          ok = q.a.some(function (r) { try { return new RegExp(r, "i").test(v); } catch (e) { return false; } });
        }
        if (ok) { fb.innerHTML = '<div class="good">✓ Верно!</div>' + explain(q); pass(i, el); }
        else {
          fails++;
          fb.innerHTML = '<div class="bad">✗ Не совсем. Перечитайте урок и попробуйте ещё раз.</div>' +
            (fails >= 1 ? '<button class="linkbtn">Показать ответ</button><div class="reveal" hidden>' + answerText(q) + explain(q) + "</div>" : "");
          fb.querySelector(".linkbtn").onclick = function () { fb.querySelector(".reveal").hidden = false; this.hidden = true; };
        }
      });
    });
    refresh();
  }

  function revealTask(q, el, i, tid, pass) {
    var box = el.querySelector(".task-extra"), btn = el.querySelector(".qbtn");
    btn.hidden = true; box.hidden = false;
    box.innerHTML = '<div class="sample"><b>Эталон:</b>' + md(q.sample) + '</div><div class="rubric"><b>Сверьтесь с критериями — отметьте то, что выполнено:</b>' +
      q.rubric.map(function (r, k) { return '<label class="opt"><input type="checkbox" value="' + k + '"><span>' + inline(r) + "</span></label>"; }).join("") +
      '</div><button class="qbtn" disabled>Засчитать</button>';
    var go = box.querySelector(".qbtn"), cbs = box.querySelectorAll("input");
    Array.prototype.forEach.call(cbs, function (c) {
      c.addEventListener("change", function () { go.disabled = !Array.prototype.every.call(cbs, function (x) { return x.checked; }); });
    });
    go.addEventListener("click", function () {
      el.querySelector(".fb").innerHTML = '<div class="good">✓ Засчитано</div>';
      Array.prototype.forEach.call(cbs, function (c) { c.disabled = true; });
      go.disabled = true; pass(i, el);
    });
  }

  function flatLessons() {
    var out = [];
    C.modules.forEach(function (m) { modTopics(m).forEach(function (t) { out.push({ m: m, t: t }); }); });
    return out;
  }

  function topicPage(mid, tid) {
    var m = byId[mid], t = m && m.topics.filter(function (x) { return x.id === tid; })[0];
    if (!t) return notFound();
    var l = lesson(tid) && prepared(tid);
    if (!l) return page("<h1>" + tid + "</h1><p>" + inline(t.desc) + '</p><p class="meta">Урок для этого топика ещё не готов.</p><p><a href="#/m/' + mid + '">← К модулю</a></p>');
    var flat = flatLessons(), k = -1;
    flat.forEach(function (x, n) { if (x.t.id === tid) k = n; });
    var prev = flat[k - 1], next = flat[k + 1];
    var h = '<div class="crumbs"><a href="#/m/' + mid + '">' + m.code + ". " + esc(shortTitle(m)) + "</a> › Урок " + tid + "</div>" +
      "<h1>" + esc(l.title) + "</h1>" + md(l.body) +
      '<h2 id="check">Проверка знаний</h2><div class="topic-state" id="topicState"></div><div id="quiz">' + quizHtml(tid, l) + "</div>";
    h += '<div class="pager">' +
      (prev ? '<a href="#/m/' + prev.m.id + "/" + prev.t.id + '"><small>← Предыдущий урок</small>' + esc(lesson(prev.t.id).title) + "</a>" : "<span></span>") +
      (next ? '<a href="#/m/' + next.m.id + "/" + next.t.id + '"><small>Следующий урок →</small>' + esc(lesson(next.t.id).title) + "</a>" : "<span></span>") + "</div>";
    return page(h);
  }


  function topics() {
    var h = md(C.topicsIntro).replace(/<h1>.*?<\/h1>/, "<h1>Все топики курса</h1>") + "<h2>Модули</h2><div class=\"cards\">";
    C.modules.forEach(function (m) {
      h += '<a class="card' + (modDone(m) ? " done" : "") + '" href="#/m/' + m.id + '"><div class="code">' + m.code + '</div><div class="t">' + esc(shortTitle(m)) + '</div><div class="w">' + (m.week || "") + "</div></a>";
    });
    return page(h + "</div>");
  }

  function notFound() { return page("<h1>Страница не найдена</h1><p><a href=\"#/\">На главную</a></p>"); }

  /* ---------- поиск ---------- */
  function docs() {
    var d = [
      { href: "#/plan", title: "План обучения", text: C.plan },
      { href: "#/actual", title: "Актуальное для 2027", text: C.actual },
      { href: "#/klimenko", title: "Конспект Клименко", text: C.klimenko }
    ];
    C.modules.forEach(function (m) {
      d.push({ href: "#/m/" + m.id, title: m.title, text: m.md });
      m.topics.forEach(function (t) {
        var l = lesson(t.id);
        if (l) d.push({ href: "#/m/" + m.id + "/" + t.id, title: t.id + " " + l.title, text: l.body });
      });
    });
    return d;
  }
  function search(q) {
    var ql = q.toLowerCase(), res = [];
    docs().forEach(function (d) {
      var low = d.text.toLowerCase(), pos = low.indexOf(ql);
      if (pos < 0 && d.title.toLowerCase().indexOf(ql) < 0) return;
      var cnt = low.split(ql).length - 1;
      var from = Math.max(0, pos - 60), snip = pos < 0 ? "" : d.text.slice(from, pos + q.length + 100).replace(/\n+/g, " ");
      var re = new RegExp("(" + q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "ig");
      res.push({ d: d, cnt: cnt, snip: esc(snip).replace(re, "<mark>$1</mark>") });
    });
    res.sort(function (a, b) { return b.cnt - a.cnt; });
    var h = "<h1>Поиск: «" + esc(q) + "»</h1>";
    if (!res.length) h += "<p>Ничего не найдено.</p>";
    res.forEach(function (r) {
      h += '<a class="result" href="' + r.d.href + '"><b>' + esc(r.d.title) + "</b> <small>совпадений: " + r.cnt + "</small><small>…" + r.snip + "…</small></a>";
    });
    return page(h);
  }

  /* ---------- роутер ---------- */
  function render() {
    var hash = decodeURIComponent(location.hash || "#/"), html, m, topic = null;
    if (hash === "#/" || hash === "#") html = home();
    else if (hash === "#/plan") html = page(md(C.plan));
    else if (hash === "#/actual") html = page(md(C.actual));
    else if (hash === "#/klimenko") html = page(md(C.klimenko));
    else if (hash === "#/topics") html = topics();
    else if ((m = /^#\/m\/(m\d+)$/.exec(hash))) html = modulePage(m[1]);
    else if ((m = /^#\/m\/(m\d+)\/([\d.]+)$/.exec(hash))) { html = topicPage(m[1], m[2]); topic = m; }
    else if ((m = /^#\/search\/(.+)$/.exec(hash))) html = search(m[1]);
    else html = notFound();
    $("#main").innerHTML = html;
    navRoute = topic ? "#/m/" + topic[1] : hash;
    buildNav(navRoute);
    if (topic && lesson(topic[2])) bindQuiz(topic[2], prepared(topic[2]));
    var title = (/<h1[^>]*>(.*?)<\/h1>/.exec(html) || [])[1];
    var tt = title ? title.replace(/<[^>]+>/g, "") : ""; document.title = tt && tt !== "Системный аналитик с нуля" ? tt + " — Системный аналитик с нуля" : "Системный аналитик с нуля";
    window.scrollTo(0, 0);
    $("#nav").classList.remove("open");
    var btn = $("#doneBtn");
    if (btn) btn.onclick = function () {
      var id = /m\/(m\d+)/.exec(location.hash)[1];
      done[id] = !done[id]; if (!done[id]) delete done[id];
      saveDone(); render();
    };
  }

  window.addEventListener("hashchange", render);
  $("#menuBtn").onclick = function () { $("#nav").classList.toggle("open"); };
  $("#search").addEventListener("input", function (e) {
    var q = e.target.value.trim();
    if (q.length >= 2) location.hash = "#/search/" + encodeURIComponent(q);
    else if (!q) location.hash = "#/";
  });

  var root = document.documentElement;
  try { var t = localStorage.getItem("sa-theme"); if (t) root.setAttribute("data-theme", t); } catch (e) {}
  $("#themeBtn").onclick = function () {
    var dark = root.getAttribute("data-theme") === "dark" ||
      (!root.getAttribute("data-theme") && matchMedia("(prefers-color-scheme: dark)").matches);
    var t = dark ? "light" : "dark";
    root.setAttribute("data-theme", t);
    try { localStorage.setItem("sa-theme", t); } catch (e) {}
  };

  render();
})();
