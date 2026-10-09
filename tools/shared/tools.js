// Shared helpers for every Parottasalna tool: DOM building, local storage,
// confirm dialog, undo toast, dropdown menus and JSON export/import.
window.PTools = (() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const uid = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);

  // Builds elements with textContent only, so user data is never parsed as HTML.
  function el(tag, props = {}, ...children) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else if (k.startsWith("data-") || k.startsWith("aria-") || k === "role") n.setAttribute(k, v);
      else n[k] = v;
    }
    for (const c of children) if (c !== null && c !== undefined && c !== false) n.append(c);
    return n;
  }

  /* ---------- local storage (may be blocked, so never throw) ---------- */
  const store = {
    read(key) {
      try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
    },
    write(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
    },
    remove(key) {
      try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
    },
  };

  // Shows "✓ Saved" next to the storage note, or the warning banner when storage is blocked.
  let savedTimer;
  function showSaved(ok) {
    const warn = $("#storage-warning");
    if (warn) warn.hidden = ok;
    const s = $("#save-status");
    if (!s || !ok) return;
    s.textContent = "✓ Saved";
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => (s.textContent = ""), 1500);
  }

  /* ---------- confirm dialog ---------- */
  let confirmDlg;
  function confirmBox(title, msg, okLabel = "Confirm") {
    if (!confirmDlg) {
      confirmDlg = el("dialog", { "aria-labelledby": "pt-confirm-title" },
        el("form", { method: "dialog" },
          el("h2", { id: "pt-confirm-title" }),
          el("p", { id: "pt-confirm-msg" }),
          el("div", { class: "dialog-actions" },
            el("span", { class: "spacer" }),
            el("button", { type: "button", class: "btn", id: "pt-confirm-cancel", text: "Cancel" }),
            el("button", { type: "button", class: "btn btn-danger", id: "pt-confirm-ok" }))));
      document.body.append(confirmDlg);
    }
    $("#pt-confirm-title").textContent = title;
    $("#pt-confirm-msg").textContent = msg;
    $("#pt-confirm-ok").textContent = okLabel;
    confirmDlg.showModal();
    return new Promise((resolve) => {
      const okBtn = $("#pt-confirm-ok"), cancelBtn = $("#pt-confirm-cancel");
      const done = (v) => {
        confirmDlg.close();
        okBtn.removeEventListener("click", ok);
        cancelBtn.removeEventListener("click", cancel);
        confirmDlg.removeEventListener("cancel", esc);
        resolve(v);
      };
      const ok = () => done(true), cancel = () => done(false), esc = (e) => { e.preventDefault(); done(false); };
      okBtn.addEventListener("click", ok);
      cancelBtn.addEventListener("click", cancel);
      confirmDlg.addEventListener("cancel", esc);
    });
  }

  /* ---------- toast with optional undo ---------- */
  let toastEl, toastTimer, undoFn = null;
  function toast(msg, undo) {
    if (!toastEl) {
      toastEl = el("div", { class: "toast", role: "status", "aria-live": "polite" },
        el("span", { class: "toast-msg" }),
        el("button", { type: "button", class: "toast-undo", text: "Undo" }));
      toastEl.querySelector(".toast-undo").addEventListener("click", () => {
        if (undoFn) undoFn();
        undoFn = null;
        toastEl.classList.remove("show");
      });
      document.body.append(toastEl);
    }
    toastEl.querySelector(".toast-msg").textContent = msg;
    toastEl.querySelector(".toast-undo").hidden = !undo;
    undoFn = undo || null;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.classList.remove("show"); undoFn = null; }, 7000);
  }

  /* ---------- dropdown menus: any .dropdown > button toggles its .menu ---------- */
  function closeMenus(except) {
    document.querySelectorAll(".dropdown.open").forEach((d) => {
      if (d === except) return;
      d.classList.remove("open");
      d.querySelector(":scope > button")?.setAttribute("aria-expanded", "false");
    });
  }
  document.addEventListener("click", (e) => {
    const trigger = e.target.closest(".dropdown > button");
    if (trigger) {
      const dd = trigger.parentElement;
      closeMenus(dd);
      trigger.setAttribute("aria-expanded", dd.classList.toggle("open"));
      return;
    }
    if (!e.target.closest(".menu")) closeMenus();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenus(); });

  /* ---------- JSON export / import ---------- */
  function downloadJSON(data, name) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = el("a", { href: URL.createObjectURL(blob), download: name.replace(/[^\w-]+/g, "-").toLowerCase() + "-" + new Date().toISOString().slice(0, 10) + ".json" });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  // Wires a hidden <input type=file> to a callback that receives parsed JSON (or null if invalid).
  function onJSONFile(input, cb) {
    input.addEventListener("change", async () => {
      const file = input.files[0];
      input.value = "";
      if (!file) return;
      let data = null;
      try { data = JSON.parse(await file.text()); } catch (e) { data = null; }
      cb(data);
    });
  }

  return { $, el, uid, store, showSaved, confirmBox, toast, closeMenus, downloadJSON, onJSONFile };
})();
