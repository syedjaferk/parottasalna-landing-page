(() => {
  "use strict";
  const KEY = "parottasalna.dsa-tracker.v1";
  const { $, el, store, showSaved, confirmBox, toast, closeMenus, downloadJSON, onJSONFile } = window.PTools;

  const DIFF = {
    E: { label: "Easy", cls: "low" },
    M: { label: "Medium", cls: "medium" },
    H: { label: "Hard", cls: "high" },
  };

  /* ---------- sheet ---------- */
  const sheet = window.DSA_SHEET || { topics: [], patterns: [] };
  const patterns = (sheet.patterns || []).map((p) => ({ ...p, questions: [] }));
  const patternById = new Map(patterns.map((p) => [p.id, p]));
  const topics = (sheet.topics || []).map((t) => ({
    id: t.id,
    name: t.name,
    questions: t.questions.map((line) => {
      const [title, slug, d, pats = ""] = line.split("|").map((s) => s.trim());
      const ids = pats.split(",").map((x) => x.trim()).filter((x) => patternById.has(x));
      return { id: slug, title, url: "https://leetcode.com/problems/" + slug + "/", diff: DIFF[d] ? d : "M", topic: t.id, patterns: ids };
    }),
  }));
  const allQuestions = topics.flatMap((t) => t.questions);
  const topicById = new Map(topics.map((t) => [t.id, t]));
  const questionById = new Map(allQuestions.map((q) => [q.id, q]));
  allQuestions.forEach((q) => q.patterns.forEach((id) => patternById.get(id).questions.push(q)));

  /* ---------- saved progress ---------- */
  const blank = () => ({ version: 1, done: {}, bookmarks: {}, notes: {} });

  // Accepts stored or imported data and returns clean progress, or null if unusable.
  function normalize(s) {
    if (!s || typeof s !== "object") return null;
    const out = blank();
    for (const [id, v] of Object.entries(s.done && typeof s.done === "object" ? s.done : {})) out.done[id] = Number(v) || Date.now();
    for (const [id, v] of Object.entries(s.bookmarks && typeof s.bookmarks === "object" ? s.bookmarks : {})) if (v) out.bookmarks[id] = true;
    for (const [id, v] of Object.entries(s.notes && typeof s.notes === "object" ? s.notes : {})) {
      const text = String(v || "").slice(0, 5000);
      if (text.trim()) out.notes[id] = text;
    }
    return out;
  }

  let state = normalize(store.read(KEY)) || blank();

  function save() { showSaved(store.write(KEY, state)); }
  function commit(fn) { fn(); save(); render(); }

  // Destructive changes keep a snapshot so the toast can undo them.
  function commitWithUndo(message, fn) {
    const before = JSON.stringify(state);
    commit(fn);
    toast(message, () => { state = JSON.parse(before); save(); render(); });
  }

  /* ---------- helpers ---------- */
  const isDone = (q) => Boolean(state.done[q.id]);
  const countDone = (list) => list.reduce((n, q) => n + (state.done[q.id] ? 1 : 0), 0);
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const plural = (n, word) => n + " " + word + (n === 1 ? "" : "s");

  function bar(done, total) {
    const b = el("div", { class: "bar", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": String(total), "aria-valuenow": String(done) });
    b.append(el("i", { style: "width:" + pct(done, total) + "%" }));
    return b;
  }

  function topicStatus(done, total) {
    if (!done) return el("span", { class: "status", text: "Not started" });
    if (done === total) return el("span", { class: "status complete", text: "Completed 🎉" });
    return el("span", { class: "status progress", text: "In progress" });
  }

  /* ---------- routing + filters ---------- */
  const view = $("#view");
  const filters = { status: "all", diff: "all", query: "" };
  let highlightId = null;

  function route() {
    const h = location.hash.replace(/^#\/?/, "");
    if (h.startsWith("topic/")) {
      const t = topicById.get(decodeURIComponent(h.slice(6)));
      if (t) return { name: "topic", topic: t };
    }
    if (h.startsWith("pattern/")) {
      const p = patternById.get(decodeURIComponent(h.slice(8)));
      if (p) return { name: "pattern", pattern: p };
    }
    if (h === "bookmarks") return { name: "bookmarks" };
    if (h === "patterns") return { name: "home", by: "patterns" };
    return { name: "home", by: "topics" };
  }

  // The topic or pattern currently open, if any.
  function currentGroup(r = route()) {
    if (r.name === "topic") return { kind: "topic", item: r.topic };
    if (r.name === "pattern") return { kind: "pattern", item: r.pattern };
    return null;
  }

  function passes(q) {
    if (filters.query && !q.title.toLowerCase().includes(filters.query)) return false;
    if (filters.diff !== "all" && q.diff !== filters.diff) return false;
    if (filters.status === "todo" && isDone(q)) return false;
    if (filters.status === "done" && !isDone(q)) return false;
    if (filters.status === "bookmarked" && !state.bookmarks[q.id]) return false;
    return true;
  }

  /* ---------- rendering ---------- */
  // ctx.showTopic adds the topic tag; ctx.skipPattern hides the pattern you're already viewing.
  function questionRow(q, index, ctx) {
    const done = isDone(q);
    const starred = Boolean(state.bookmarks[q.id]);
    const hasNote = Boolean(state.notes[q.id]);
    const check = el("input", { type: "checkbox", checked: done, "aria-label": "Mark “" + q.title + "” as solved", "data-act": "toggle" });
    return el("li", { class: "q" + (done ? " done" : ""), "data-id": q.id },
      el("label", { class: "check" }, check, el("span", { "aria-hidden": "true" })),
      el("span", { class: "num", text: String(index + 1) }),
      el("div", { class: "q-main" },
        el("a", { class: "q-title", href: q.url, target: "_blank", rel: "noopener", text: q.title }),
        el("div", { class: "q-tags" },
          el("span", { class: "tag " + DIFF[q.diff].cls, text: DIFF[q.diff].label }),
          ctx.showTopic ? el("a", { class: "tag topic-tag", href: "#/topic/" + q.topic, text: topicById.get(q.topic).name }) : null,
          ...q.patterns.filter((id) => id !== ctx.skipPattern).map((id) =>
            el("a", { class: "tag pattern-tag", href: "#/pattern/" + id, title: "Pattern: " + patternById.get(id).name, text: "◇ " + patternById.get(id).name })),
          hasNote ? el("span", { class: "tag note-tag", text: "📝 Note" }) : null)),
      el("button", { type: "button", class: "icon-btn note-btn" + (hasNote ? " on" : ""), "data-act": "note", title: hasNote ? "Edit note" : "Add a note", "aria-label": (hasNote ? "Edit note for " : "Add a note to ") + q.title, text: "📝" }),
      el("button", { type: "button", class: "icon-btn star" + (starred ? " on" : ""), "data-act": "bookmark", title: starred ? "Remove bookmark" : "Bookmark", "aria-pressed": String(starred), "aria-label": "Bookmark " + q.title, text: starred ? "★" : "☆" }));
  }

  function questionList(list, ctx, emptyText) {
    const shown = list.filter(passes);
    if (!shown.length) return el("div", { class: "empty", text: emptyText });
    return el("ol", { class: "qlist" }, ...shown.map((q) => questionRow(q, list.indexOf(q), ctx)));
  }

  function filterBar() {
    const seg = el("div", { class: "segmented", role: "group", "aria-label": "Show" });
    for (const [value, label] of [["all", "All"], ["todo", "To do"], ["done", "Solved"], ["bookmarked", "★ Bookmarked"]]) {
      seg.append(el("button", { type: "button", class: filters.status === value ? "active" : "", "aria-pressed": String(filters.status === value), "data-status": value, text: label }));
    }
    const diff = el("select", { class: "diff-select", "aria-label": "Difficulty", "data-act": "diff" },
      el("option", { value: "all", text: "All difficulties" }),
      ...Object.entries(DIFF).map(([k, d]) => el("option", { value: k, text: d.label })));
    diff.value = filters.diff;
    return el("div", { class: "filters" }, seg, diff);
  }

  function groupCard(href, name, list, desc) {
    const d = countDone(list);
    return el("a", { class: "topic" + (d === list.length ? " complete" : ""), href },
      el("div", { class: "topic-top" }, el("h3", { text: name }), topicStatus(d, list.length)),
      desc ? el("p", { class: "topic-desc", text: desc }) : null,
      el("p", { class: "topic-count", text: d + " / " + list.length + " solved" }),
      bar(d, list.length));
  }

  function renderHome(by) {
    const total = allQuestions.length;
    const solved = countDone(allQuestions);
    const today = startOfToday();
    const solvedToday = Object.values(state.done).filter((t) => t >= today).length;
    const bookmarks = Object.keys(state.bookmarks).filter((id) => questionById.has(id)).length;

    // Continue with the unfinished topic you touched most recently.
    let continueTopic = null, latest = 0;
    for (const t of topics) {
      const d = countDone(t.questions);
      if (!d || d === t.questions.length) continue;
      const last = Math.max(...t.questions.map((q) => state.done[q.id] || 0));
      if (last > latest) { latest = last; continueTopic = t; }
    }

    const diffRows = Object.entries(DIFF).map(([k, d]) => {
      const list = allQuestions.filter((q) => q.diff === k);
      const n = countDone(list);
      return el("div", { class: "diff-row" },
        el("span", { class: "tag " + d.cls, text: d.label }),
        bar(n, list.length),
        el("span", { class: "diff-count", text: n + " / " + list.length }));
    });

    const ring = el("div", { class: "ring", style: "--p:" + pct(solved, total), role: "img", "aria-label": solved + " of " + total + " problems solved" },
      el("div", {}, el("b", { text: String(solved) }), el("span", { text: "/ " + total }), el("small", { text: "solved" })));

    const overview = el("section", { class: "overview" }, ring,
      el("div", { class: "ov-body" },
        el("h2", { text: (window.DSA_SHEET && window.DSA_SHEET.name) || "DSA Sheet" }),
        el("p", { class: "ov-sub", text: pct(solved, total) + "% complete · " + plural(solvedToday, "problem") + " solved today · " + topics.length + " topics" }),
        el("div", { class: "diff-rows" }, ...diffRows),
        el("div", { class: "ov-actions" },
          continueTopic ? el("a", { class: "btn btn-primary", href: "#/topic/" + continueTopic.id, text: "Continue: " + continueTopic.name + " →" })
            : el("a", { class: "btn btn-primary", href: "#/topic/" + topics[0].id, text: solved ? "Pick a topic below" : "Start with " + topics[0].name + " →" }),
          el("a", { class: "btn", href: "#/bookmarks", text: "★ Bookmarks (" + bookmarks + ")" }))));

    const switcher = el("div", { class: "segmented view-switch", role: "group", "aria-label": "Browse by" },
      el("a", { href: "#/", class: by === "topics" ? "active" : "", "aria-current": by === "topics" ? "page" : "false", text: "By topic (" + topics.length + ")" }),
      el("a", { href: "#/patterns", class: by === "patterns" ? "active" : "", "aria-current": by === "patterns" ? "page" : "false", text: "By pattern (" + patterns.length + ")" }));

    if (filters.query) {
      const matches = allQuestions.filter(passes).length;
      return [overview,
        el("h2", { class: "section-title", text: "Results for “" + filters.query + "” (" + matches + ")" }),
        filterBar(),
        questionList(allQuestions, { showTopic: true }, "No problems match your search.")];
    }

    const cards = by === "patterns"
      ? patterns.filter((p) => p.questions.length).map((p) => groupCard("#/pattern/" + p.id, p.name, p.questions, p.desc))
      : topics.map((t) => groupCard("#/topic/" + t.id, t.name, t.questions));
    return [overview,
      el("div", { class: "browse-head" }, el("h2", { class: "section-title", text: by === "patterns" ? "Patterns" : "Topics" }), switcher),
      el("div", { class: "topics" + (by === "patterns" ? " patterns" : "") }, ...cards)];
  }

  function renderTopic(t) {
    const d = countDone(t.questions);
    return [
      el("a", { class: "back", href: "#/", text: "← All topics" }),
      el("section", { class: "topic-head" },
        el("div", { class: "topic-top" }, el("h2", { text: t.name }), topicStatus(d, t.questions.length)),
        el("p", { class: "topic-count", text: d + " / " + t.questions.length + " solved · " + pct(d, t.questions.length) + "%" }),
        bar(d, t.questions.length)),
      filterBar(),
      questionList(t.questions, {}, "No problems match these filters."),
    ];
  }

  function renderPattern(p) {
    const d = countDone(p.questions);
    return [
      el("a", { class: "back", href: "#/patterns", text: "← All patterns" }),
      el("section", { class: "topic-head" },
        el("div", { class: "topic-top" }, el("h2", { text: "◇ " + p.name }), topicStatus(d, p.questions.length)),
        el("p", { class: "pattern-desc", text: p.desc }),
        el("p", { class: "topic-count", text: d + " / " + p.questions.length + " solved · " + pct(d, p.questions.length) + "%" }),
        bar(d, p.questions.length)),
      filterBar(),
      questionList(p.questions, { showTopic: true, skipPattern: p.id }, "No problems match these filters."),
    ];
  }

  function renderBookmarks() {
    const list = allQuestions.filter((q) => state.bookmarks[q.id]);
    return [
      el("a", { class: "back", href: "#/", text: "← All topics" }),
      el("section", { class: "topic-head" },
        el("div", { class: "topic-top" }, el("h2", { text: "★ Bookmarks" })),
        el("p", { class: "topic-count", text: plural(list.length, "bookmarked problem") + " · " + countDone(list) + " solved" })),
      filterBar(),
      questionList(list, { showTopic: true }, list.length ? "No bookmarks match these filters." : "No bookmarks yet — tap ☆ on any problem to save it here."),
    ];
  }

  function render() {
    const r = route();
    const parts = r.name === "topic" ? renderTopic(r.topic) : r.name === "pattern" ? renderPattern(r.pattern) : r.name === "bookmarks" ? renderBookmarks() : renderHome(r.by);
    view.replaceChildren(...parts);
    const group = currentGroup(r);
    document.title = (group ? group.item.name + " — " : r.name === "bookmarks" ? "Bookmarks — " : "") + "DSA Tracker · Parottasalna";

    const clearGroup = $("#clear-topic");
    clearGroup.disabled = !group;
    clearGroup.textContent = group ? "Clear “" + group.item.name + "” progress" : "Clear a topic or pattern (open one first)";

    if (highlightId) {
      const row = view.querySelector('.q[data-id="' + CSS.escape(highlightId) + '"]');
      highlightId = null;
      if (row) {
        row.scrollIntoView({ block: "center", behavior: "smooth" });
        row.classList.add("flash");
        row.querySelector(".q-title").focus({ preventScroll: true });
      }
    }
  }

  /* ---------- notes dialog ---------- */
  const noteDlg = $("#note-dialog");
  let noteFor = null;
  function openNote(id) {
    const q = questionById.get(id);
    if (!q) return;
    noteFor = id;
    $("#note-title").textContent = "Notes";
    $("#note-sub").textContent = q.title + " · " + DIFF[q.diff].label;
    $("#note-text").value = state.notes[id] || "";
    $("#note-delete").hidden = !state.notes[id];
    noteDlg.showModal();
    $("#note-text").focus();
  }
  $("#note-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const text = $("#note-text").value;
    const id = noteFor;
    noteDlg.close();
    commit(() => { if (text.trim()) state.notes[id] = text.slice(0, 5000); else delete state.notes[id]; });
  });
  $("#note-cancel").addEventListener("click", () => noteDlg.close());
  $("#note-delete").addEventListener("click", () => {
    const id = noteFor;
    noteDlg.close();
    commitWithUndo("Note deleted", () => delete state.notes[id]);
  });
  noteDlg.addEventListener("click", (e) => { if (e.target === noteDlg) noteDlg.close(); });

  /* ---------- events ---------- */
  view.addEventListener("change", (e) => {
    const t = e.target;
    if (t.dataset.act === "toggle") {
      const id = t.closest(".q").dataset.id;
      commit(() => { if (t.checked) state.done[id] = Date.now(); else delete state.done[id]; });
      if (t.checked) {
        const q = questionById.get(id), topic = topicById.get(q.topic);
        if (countDone(topic.questions) === topic.questions.length) toast("🎉 You finished " + topic.name + "!");
      }
    } else if (t.dataset.act === "diff") {
      filters.diff = t.value;
      render();
    }
  });
  view.addEventListener("click", (e) => {
    const statusBtn = e.target.closest("[data-status]");
    if (statusBtn) { filters.status = statusBtn.dataset.status; render(); return; }
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    const id = btn.closest(".q").dataset.id;
    if (btn.dataset.act === "bookmark") commit(() => { if (state.bookmarks[id]) delete state.bookmarks[id]; else state.bookmarks[id] = true; });
    else if (btn.dataset.act === "note") openNote(id);
  });

  $("#search").addEventListener("input", (e) => { filters.query = e.target.value.trim().toLowerCase(); render(); });
  window.addEventListener("hashchange", () => { render(); window.scrollTo(0, 0); });

  $("#random").addEventListener("click", () => {
    const group = currentGroup();
    const pool = (group ? group.item.questions : allQuestions).filter((q) => !isDone(q));
    if (!pool.length) { toast(group ? "Every problem in " + group.item.name + " is solved 🎉" : "You've solved the whole sheet 🎉"); return; }
    const q = pool[Math.floor(Math.random() * pool.length)];
    Object.assign(filters, { status: "all", diff: "all", query: "" });
    $("#search").value = "";
    highlightId = q.id;
    const target = group && group.kind === "pattern" ? "#/pattern/" + group.item.id : "#/topic/" + q.topic;
    if (location.hash === target) render(); else location.hash = target;
    toast("Try this one: " + q.title);
  });

  /* ---------- clear / export / import ---------- */
  async function clearGroup() {
    const group = currentGroup();
    if (!group) return;
    const { name, questions } = group.item;
    const ids = questions.map((q) => q.id);
    const n = ids.filter((id) => state.done[id] || state.bookmarks[id] || state.notes[id]).length;
    if (!n) { toast("Nothing to clear in " + name); return; }
    const extra = group.kind === "pattern" ? " These problems also count towards their topics." : "";
    if (!(await confirmBox("Clear “" + name + "”?", "This removes solved marks, bookmarks and notes for " + plural(n, "problem") + " in this " + group.kind + "." + extra, "Clear " + group.kind))) return;
    commitWithUndo("Cleared " + name, () => ids.forEach((id) => { delete state.done[id]; delete state.bookmarks[id]; delete state.notes[id]; }));
  }
  async function clearAll(kind, label) {
    const n = Object.keys(state[kind]).length;
    if (!n) { toast("There are no " + label + " to clear"); return; }
    if (!(await confirmBox("Clear all " + label + "?", "This removes " + n + " " + label + " from this browser.", "Clear " + label))) return;
    commitWithUndo("Cleared all " + label, () => (state[kind] = {}));
  }
  async function resetAll() {
    if (!(await confirmBox("Reset everything?", "This deletes all solved marks, bookmarks and notes from this browser. Export first if you want a backup.", "Reset everything"))) return;
    commitWithUndo("Progress reset", () => { store.remove(KEY); state = blank(); });
  }

  document.querySelectorAll(".toolbar .menu").forEach((m) => m.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || b.disabled) return;
    closeMenus();
    const act = b.dataset.act;
    if (act === "clear-topic") clearGroup();
    else if (act === "clear-done") clearAll("done", "solved marks");
    else if (act === "clear-bookmarks") clearAll("bookmarks", "bookmarks");
    else if (act === "clear-notes") clearAll("notes", "notes");
    else if (act === "reset") resetAll();
    else if (act === "export") { downloadJSON({ app: "parottasalna-dsa-tracker", exported: new Date().toISOString(), ...state }, "dsa-progress"); toast("Progress exported"); }
    else if (act === "import") $("#import-file").click();
  }));

  onJSONFile($("#import-file"), async (data) => {
    const next = normalize(data);
    if (!next) { toast("That file isn't a valid DSA tracker export"); return; }
    const n = Object.keys(next.done).length;
    if (!(await confirmBox("Replace your progress?", "Import " + plural(n, "solved problem") + ", " + Object.keys(next.bookmarks).length + " bookmarks and " + Object.keys(next.notes).length + " notes? This replaces your current progress.", "Import"))) return;
    commitWithUndo("Progress imported", () => (state = next));
  });

  // Keep several open tabs in sync
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY) return;
    let next = null;
    try { next = e.newValue ? normalize(JSON.parse(e.newValue)) : null; } catch (err) { next = null; }
    state = next || blank();
    render();
  });

  render();
})();
