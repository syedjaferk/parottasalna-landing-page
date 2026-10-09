(() => {
  "use strict";
  const KEY = "parottasalna.kanban.v1";
  const PRIORITIES = ["low", "medium", "high"];
  const { $, el, uid, store, showSaved, confirmBox, toast, closeMenus, downloadJSON, onJSONFile } = window.PTools;

  /* ---------- data ---------- */
  function defaultBoard() {
    return {
      version: 1,
      title: "My board",
      columns: [
        { id: uid(), name: "To do", cards: [
          { id: uid(), title: "Welcome to your Kanban board 👋", desc: "Drag cards between columns, or click a card to edit it. Everything is saved in this browser only — use Data ▸ Export to back it up.", priority: "low", due: "", created: Date.now() },
          { id: uid(), title: "Click a column name to rename it", desc: "", priority: "", due: "", created: Date.now() },
        ] },
        { id: uid(), name: "In progress", cards: [] },
        { id: uid(), name: "Done", cards: [] },
      ],
    };
  }

  // Accepts anything (stored or imported) and returns a clean board, or null if unusable.
  function normalize(b) {
    if (!b || typeof b !== "object" || !Array.isArray(b.columns)) return null;
    const seen = new Set();
    const freshId = (id) => { let v = typeof id === "string" && id ? id : uid(); while (seen.has(v)) v = uid(); seen.add(v); return v; };
    return {
      version: 1,
      title: String(b.title || "My board").slice(0, 80),
      columns: b.columns.filter((c) => c && typeof c === "object").map((c) => ({
        id: freshId(c.id),
        name: String(c.name || "Untitled").slice(0, 60),
        cards: (Array.isArray(c.cards) ? c.cards : []).filter((x) => x && typeof x === "object" && String(x.title || "").trim()).map((x) => ({
          id: freshId(x.id),
          title: String(x.title).trim().slice(0, 200),
          desc: String(x.desc || "").slice(0, 5000),
          priority: PRIORITIES.includes(x.priority) ? x.priority : "",
          due: /^\d{4}-\d{2}-\d{2}$/.test(x.due || "") ? x.due : "",
          created: Number(x.created) || Date.now(),
        })),
      })),
    };
  }

  let board = normalize(store.read(KEY)) || defaultBoard();

  function save() { showSaved(store.write(KEY, board)); }

  const findCard = (id) => {
    for (const col of board.columns) {
      const i = col.cards.findIndex((c) => c.id === id);
      if (i > -1) return { col, i, card: col.cards[i] };
    }
    return null;
  };
  const findCol = (id) => board.columns.find((c) => c.id === id);

  function commit(fn) { fn(); save(); render(); }

  // Destructive changes keep a snapshot so the toast can undo them.
  function commitWithUndo(message, fn) {
    const before = JSON.stringify(board);
    commit(fn);
    toast(message, () => { board = JSON.parse(before); save(); render(); });
  }

  /* ---------- rendering ---------- */
  const boardEl = $("#board");
  let openAdder = null; // column id whose "add card" form is open
  let focusAdder = false; // move focus into it on the next render only
  let query = "";


  const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const fmtDate = (s) => new Date(s + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const matches = (card) => !query || (card.title + " " + card.desc).toLowerCase().includes(query);

  function cardEl(card, isLastCol) {
    const meta = el("div", { class: "card-meta" });
    if (card.priority) meta.append(el("span", { class: "tag " + card.priority, text: card.priority[0].toUpperCase() + card.priority.slice(1) }));
    if (card.due) {
      const overdue = !isLastCol && new Date(card.due + "T00:00:00") < today();
      meta.append(el("span", { class: "tag" + (overdue ? " overdue" : ""), text: "📅 " + fmtDate(card.due) + (overdue ? " · overdue" : "") }));
    }
    return el("article", {
      class: "card" + (card.priority ? " prio-" + card.priority : "") + (matches(card) ? "" : " hidden"),
      draggable: true, tabIndex: 0, "data-id": card.id, role: "button",
      "aria-label": card.title + " — open to edit",
    },
      el("div", { class: "card-title", text: card.title }),
      card.desc ? el("p", { class: "card-desc", text: card.desc }) : null,
      meta);
  }

  function columnEl(col, idx) {
    const isLast = idx === board.columns.length - 1;
    const visible = col.cards.filter(matches).length;
    const name = el("input", { class: "col-name", value: col.name, maxLength: 60, "aria-label": "Column name", spellcheck: false });
    name.addEventListener("change", () => {
      const v = name.value.trim();
      if (!v) { name.value = col.name; return; }
      commit(() => (col.name = v));
    });
    name.addEventListener("keydown", (e) => { if (e.key === "Enter") name.blur(); if (e.key === "Escape") { name.value = col.name; name.blur(); } });

    const menu = el("div", { class: "dropdown" },
      el("button", { class: "icon-btn", type: "button", text: "⋯", "aria-label": "Column options for " + col.name, "aria-haspopup": "menu", "aria-expanded": "false" }),
      el("div", { class: "menu", role: "menu" },
        el("button", { type: "button", role: "menuitem", text: "← Move left", disabled: idx === 0, "data-colact": "left" }),
        el("button", { type: "button", role: "menuitem", text: "Move right →", disabled: isLast, "data-colact": "right" }),
        el("hr"),
        el("button", { type: "button", role: "menuitem", class: "danger", text: "Clear cards in this column", disabled: !col.cards.length, "data-colact": "clear" }),
        el("button", { type: "button", role: "menuitem", class: "danger", text: "Delete column", "data-colact": "delete" })));

    const list = el("div", { class: "cards", "data-col": col.id });
    col.cards.forEach((c) => list.append(cardEl(c, isLast)));
    if (!col.cards.length) list.append(el("div", { class: "empty", text: "No cards yet — drop one here" }));
    else if (!visible) list.append(el("div", { class: "empty", text: "No cards match your search" }));

    const adder = el("div", { class: "adder" });
    if (openAdder === col.id) {
      const ta = el("textarea", { placeholder: "What needs to be done?", maxLength: 200, "aria-label": "New card title" });
      const add = () => {
        const t = ta.value.trim();
        if (!t) { ta.focus(); return; }
        focusAdder = true;
        commit(() => col.cards.push({ id: uid(), title: t, desc: "", priority: "", due: "", created: Date.now() }));
      };
      ta.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); add(); }
        if (e.key === "Escape") { openAdder = null; render(); }
      });
      const addBtn = el("button", { class: "btn btn-primary", type: "button", text: "Add card" });
      addBtn.addEventListener("click", add);
      const cancel = el("button", { class: "btn", type: "button", text: "Cancel" });
      cancel.addEventListener("click", () => { openAdder = null; render(); });
      adder.append(ta, el("div", { class: "row" }, addBtn, cancel));
      if (focusAdder) { focusAdder = false; requestAnimationFrame(() => ta.focus()); }
    } else {
      const b = el("button", { class: "btn add-btn", type: "button", text: "+ Add a card" });
      b.addEventListener("click", () => { openAdder = col.id; focusAdder = true; render(); });
      adder.append(b);
    }

    return el("section", { class: "col", "data-id": col.id, "aria-label": col.name },
      el("header", { class: "col-head" }, name, el("span", { class: "count", text: query ? visible + "/" + col.cards.length : String(col.cards.length) }), menu),
      list, adder);
  }

  function render() {
    const scroll = boardEl.scrollLeft;
    boardEl.replaceChildren(...board.columns.map(columnEl));
    const addCol = el("button", { class: "btn", type: "button", text: "+ Add another column" });
    addCol.addEventListener("click", addColumn);
    boardEl.append(el("div", { class: "new-col" }, addCol));
    boardEl.scrollLeft = scroll;
    const t = $("#board-title");
    if (document.activeElement !== t) t.value = board.title;
    document.title = board.title + " — Kanban · Parottasalna";

    // Per-column entries in the Clear menu
    const holder = $("#clear-cols");
    holder.replaceChildren(...board.columns.map((c) =>
      el("button", { type: "button", role: "menuitem", text: `“${c.name}” (${c.cards.length})`, disabled: !c.cards.length, "data-clearcol": c.id })));
    if (!board.columns.length) holder.append(el("button", { type: "button", text: "No columns", disabled: true }));
  }

  function addColumn() {
    const col = { id: uid(), name: "New column", cards: [] };
    commit(() => board.columns.push(col));
    const input = boardEl.querySelector(`.col[data-id="${col.id}"] .col-name`);
    boardEl.scrollLeft = boardEl.scrollWidth;
    if (input) { input.focus(); input.select(); }
  }

  /* ---------- clear actions ---------- */
  async function clearColumn(col) {
    if (!col || !col.cards.length) return;
    if (!(await confirmBox(`Clear “${col.name}”?`, `This removes ${col.cards.length} card${col.cards.length > 1 ? "s" : ""} from this column.`, "Clear cards"))) return;
    commitWithUndo(`Cleared “${col.name}”`, () => (col.cards = []));
  }
  async function clearAllCards() {
    const n = board.columns.reduce((a, c) => a + c.cards.length, 0);
    if (!n) { toast("There are no cards to clear"); return; }
    if (!(await confirmBox("Clear all cards?", `This removes all ${n} cards. Your columns stay as they are.`, "Clear all cards"))) return;
    commitWithUndo("All cards cleared", () => board.columns.forEach((c) => (c.cards = [])));
  }
  async function resetBoard() {
    if (!(await confirmBox("Reset the whole board?", "This deletes every card, column and the board name from this browser and starts fresh. Export first if you want a backup.", "Reset board"))) return;
    commitWithUndo("Board reset", () => {
      store.remove(KEY);
      board = defaultBoard();
    });
  }

  /* ---------- export / import ---------- */
  function exportBoard() {
    downloadJSON(board, board.title || "kanban");
    toast("Board exported");
  }
  onJSONFile($("#import-file"), async (data) => {
    const next = normalize(data);
    if (!next) { toast("That file isn't a valid Kanban export"); return; }
    if (!(await confirmBox("Replace this board?", `Import “${next.title}” with ${next.columns.length} columns? It replaces the current board.`, "Import"))) return;
    commitWithUndo("Board imported", () => (board = next));
  });

  /* ---------- card dialog ---------- */
  const dlg = $("#card-dialog");
  let editing = null;
  function openCard(id) {
    const found = findCard(id);
    if (!found) return;
    editing = id;
    const { card, col } = found;
    $("#f-title").value = card.title;
    $("#f-desc").value = card.desc;
    $("#f-priority").value = card.priority;
    $("#f-due").value = card.due;
    $("#f-col").replaceChildren(...board.columns.map((c) => el("option", { value: c.id, text: c.name, selected: c.id === col.id })));
    $("#f-created").textContent = "Created " + new Date(card.created).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
    dlg.showModal();
    $("#f-title").focus();
  }
  $("#card-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const found = findCard(editing);
    const title = $("#f-title").value.trim();
    if (!found || !title) return;
    commit(() => {
      Object.assign(found.card, { title, desc: $("#f-desc").value, priority: $("#f-priority").value, due: $("#f-due").value });
      const target = findCol($("#f-col").value);
      if (target && target !== found.col) { found.col.cards.splice(found.i, 1); target.cards.push(found.card); }
    });
    dlg.close();
  });
  $("#card-cancel").addEventListener("click", () => dlg.close());
  $("#card-delete").addEventListener("click", () => {
    const found = findCard(editing);
    dlg.close();
    if (found) commitWithUndo(`Deleted “${found.card.title}”`, () => found.col.cards.splice(found.i, 1));
  });
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });

  /* ---------- events ---------- */
  boardEl.addEventListener("click", (e) => {
    const card = e.target.closest(".card");
    if (card) { openCard(card.dataset.id); return; }
    const act = e.target.closest("[data-colact]");
    if (!act) return;
    closeMenus();
    const col = findCol(act.closest(".col").dataset.id);
    const i = board.columns.indexOf(col);
    const a = act.dataset.colact;
    if (a === "left" || a === "right") {
      const j = a === "left" ? i - 1 : i + 1;
      commit(() => ([board.columns[i], board.columns[j]] = [board.columns[j], board.columns[i]]));
    } else if (a === "clear") clearColumn(col);
    else if (a === "delete") {
      const msg = col.cards.length ? `“${col.name}” and its ${col.cards.length} card${col.cards.length > 1 ? "s" : ""} will be deleted.` : `“${col.name}” will be deleted.`;
      confirmBox("Delete column?", msg, "Delete column").then((ok) => ok && commitWithUndo(`Deleted column “${col.name}”`, () => board.columns.splice(i, 1)));
    }
  });
  boardEl.addEventListener("keydown", (e) => {
    const card = e.target.closest(".card");
    if (card && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openCard(card.dataset.id); }
  });

  // Drag and drop
  let dragId = null;
  const placeholder = el("div", { class: "placeholder" });
  boardEl.addEventListener("dragstart", (e) => {
    const card = e.target.closest(".card");
    if (!card) return;
    dragId = card.dataset.id;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", dragId);
    requestAnimationFrame(() => card.classList.add("dragging"));
  });
  boardEl.addEventListener("dragover", (e) => {
    if (!dragId) return;
    const list = e.target.closest(".col")?.querySelector(".cards");
    if (!list) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    list.querySelector(".empty")?.setAttribute("hidden", "");
    const after = [...list.querySelectorAll(".card:not(.dragging):not(.hidden)")]
      .find((c) => { const r = c.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; });
    if (after) { if (placeholder.nextElementSibling !== after) list.insertBefore(placeholder, after); }
    else if (list.lastElementChild !== placeholder) list.append(placeholder);
  });
  boardEl.addEventListener("drop", (e) => {
    if (!dragId || !placeholder.parentElement) return;
    e.preventDefault();
    const colId = placeholder.parentElement.dataset.col;
    let next = placeholder.nextElementSibling;
    while (next && !(next.classList.contains("card") && !next.classList.contains("dragging"))) next = next.nextElementSibling;
    const beforeId = next ? next.dataset.id : null;
    const id = dragId;
    dragId = null;
    placeholder.remove();
    const found = findCard(id), target = findCol(colId);
    if (!found || !target) return render();
    commit(() => {
      found.col.cards.splice(found.i, 1);
      const at = beforeId ? target.cards.findIndex((c) => c.id === beforeId) : -1;
      at > -1 ? target.cards.splice(at, 0, found.card) : target.cards.push(found.card);
    });
  });
  boardEl.addEventListener("dragend", () => {
    if (dragId) { dragId = null; placeholder.remove(); render(); }
  });

  document.querySelectorAll(".toolbar .menu").forEach((m) => m.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || b.disabled) return;
    closeMenus();
    if (b.dataset.clearcol) clearColumn(findCol(b.dataset.clearcol));
    else if (b.dataset.act === "clear-cards") clearAllCards();
    else if (b.dataset.act === "reset") resetBoard();
    else if (b.dataset.act === "export") exportBoard();
    else if (b.dataset.act === "import") $("#import-file").click();
  }));

  $("#add-column").addEventListener("click", addColumn);
  const titleInput = $("#board-title");
  titleInput.addEventListener("change", () => commit(() => (board.title = titleInput.value.trim() || "My board")));
  titleInput.addEventListener("keydown", (e) => { if (e.key === "Enter") titleInput.blur(); });
  $("#search").addEventListener("input", (e) => { query = e.target.value.trim().toLowerCase(); render(); });

  // Keep several open tabs in sync
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY) return;
    let next = null;
    try { next = e.newValue ? normalize(JSON.parse(e.newValue)) : null; } catch (err) { next = null; }
    board = next || defaultBoard();
    render();
  });

  render();
  save();
})();
