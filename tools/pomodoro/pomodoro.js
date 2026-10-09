(() => {
  "use strict";
  const KEY = "parottasalna.pomodoro.v1";
  const { $, el, store, showSaved, confirmBox, toast, closeMenus } = window.PTools;

  const DEFAULTS = { focus: 25, short: 5, long: 15, every: 4, autoStart: false, sound: true };
  const LABELS = { focus: "Time to focus", short: "Short break", long: "Long break" };
  const TAB_NAMES = { focus: "Focus", short: "Short break", long: "Long break" };

  const todayKey = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in local time
  const clampInt = (v, min, max, fallback) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback; };

  /* ---------- state ---------- */
  // Accepts stored data and returns a clean state; a running timer survives reloads via endAt.
  function normalize(s) {
    s = s && typeof s === "object" ? s : {};
    const set = s.settings || {};
    const settings = {
      focus: clampInt(set.focus, 1, 180, DEFAULTS.focus),
      short: clampInt(set.short, 1, 60, DEFAULTS.short),
      long: clampInt(set.long, 1, 90, DEFAULTS.long),
      every: clampInt(set.every, 2, 6, DEFAULTS.every),
      autoStart: Boolean(set.autoStart),
      sound: set.sound === undefined ? DEFAULTS.sound : Boolean(set.sound),
    };
    const mode = ["focus", "short", "long"].includes(s.mode) ? s.mode : "focus";
    const full = settings[mode] * 60000;
    const stats = s.stats && s.stats.date === todayKey() ? { date: s.stats.date, sessions: clampInt(s.stats.sessions, 0, 999, 0), minutes: clampInt(s.stats.minutes, 0, 99999, 0) } : { date: todayKey(), sessions: 0, minutes: 0 };
    return {
      settings, mode, stats,
      round: clampInt(s.round, 0, 999, 0),
      running: Boolean(s.running && s.endAt),
      endAt: Number(s.endAt) || null,
      remaining: clampInt(s.remaining, 0, full, full),
      task: String(s.task || "").slice(0, 120),
    };
  }

  let state = normalize(store.read(KEY));
  const save = () => showSaved(store.write(KEY, state));
  const duration = (mode = state.mode) => state.settings[mode] * 60000;
  const timeLeft = () => (state.running ? Math.max(0, state.endAt - Date.now()) : state.remaining);

  /* ---------- sound + notifications ---------- */
  let audio;
  function unlockAudio() {
    if (audio || !(window.AudioContext || window.webkitAudioContext)) return;
    audio = new (window.AudioContext || window.webkitAudioContext)();
  }
  function chime() {
    if (!state.settings.sound || !audio) return;
    if (audio.state === "suspended") audio.resume();
    [0, 0.35, 0.7].forEach((offset, i) => {
      const t = audio.currentTime + offset;
      const osc = audio.createOscillator(), gain = audio.createGain();
      osc.type = "sine";
      osc.frequency.value = i === 2 ? 1046 : 784;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      osc.connect(gain).connect(audio.destination);
      osc.start(t);
      osc.stop(t + 0.32);
    });
  }
  const canNotify = () => "Notification" in window;
  function notify(text) {
    if (!canNotify() || Notification.permission !== "granted" || !document.hidden) return;
    try { new Notification("Pomodoro · Parottasalna", { body: text, icon: "../../logo-192.png" }); } catch (e) { /* some browsers only allow this from a service worker */ }
  }

  /* ---------- timer ---------- */
  let ticker = null;
  function startTicker() {
    clearInterval(ticker);
    ticker = setInterval(() => {
      if (state.running && Date.now() >= state.endAt) finish();
      else paint();
    }, 250);
  }

  function start() {
    unlockAudio();
    if (state.running) return;
    state.running = true;
    state.endAt = Date.now() + (state.remaining || duration());
    save();
    startTicker();
    paint();
  }
  function pause() {
    if (!state.running) return;
    state.remaining = timeLeft();
    state.running = false;
    state.endAt = null;
    save();
    paint();
  }
  function setMode(mode, { autoStart = false } = {}) {
    state.mode = mode;
    state.running = false;
    state.endAt = null;
    state.remaining = duration(mode);
    if (autoStart) start(); else { save(); paint(); }
  }
  function nextMode() {
    if (state.mode !== "focus") return "focus";
    return state.round % state.settings.every === 0 ? "long" : "short";
  }

  // A session ran out (or was skipped with counted=false).
  function finish(counted = true) {
    const was = state.mode;
    if (was === "focus" && counted) {
      if (state.stats.date !== todayKey()) state.stats = { date: todayKey(), sessions: 0, minutes: 0 };
      state.stats.sessions += 1;
      state.stats.minutes += state.settings.focus;
      state.round += 1;
    }
    const next = was === "focus" ? (counted ? nextMode() : "short") : "focus";
    if (counted) {
      chime();
      const msg = was === "focus" ? "Focus session done — time for a " + (next === "long" ? "long" : "short") + " break 🎉" : "Break's over — back to focus 💪";
      toast(msg);
      notify(msg);
    }
    setMode(next, { autoStart: counted && state.settings.autoStart });
  }

  /* ---------- painting ---------- */
  const fmt = (ms) => { const s = Math.ceil(ms / 1000); return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0"); };
  function paint() {
    const left = timeLeft(), full = duration();
    const text = fmt(left);
    $("#pomo").dataset.mode = state.mode;
    $("#time").textContent = text;
    $("#mode-label").textContent = state.running || left < full ? LABELS[state.mode] + (state.running ? "" : " · paused") : LABELS[state.mode];
    $("#dial").style.setProperty("--p", String(full ? ((full - left) / full) * 100 : 0));
    $("#start").textContent = state.running ? "Pause" : left < full ? "Resume" : "Start";
    document.querySelectorAll(".modes button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.mode === state.mode)));
    document.title = (state.running || left < full ? text + " · " + TAB_NAMES[state.mode] + " — " : "") + "Pomodoro · Parottasalna";

    const every = state.settings.every, filled = state.round % every;
    const dots = $("#dots");
    if (dots.childElementCount !== every || dots.dataset.filled !== String(filled)) {
      dots.replaceChildren(...Array.from({ length: every }, (_, i) => el("span", { class: i < filled ? "on" : "" })));
      dots.dataset.filled = String(filled);
      dots.setAttribute("aria-label", filled + " of " + every + " focus sessions before the long break");
    }
    const st = state.stats.date === todayKey() ? state.stats : { sessions: 0, minutes: 0 };
    $("#today-text").textContent = st.sessions + " focus session" + (st.sessions === 1 ? "" : "s") + " today · " + st.minutes + " min focused";
  }

  /* ---------- controls ---------- */
  $("#start").addEventListener("click", () => (state.running ? pause() : start()));
  $("#reset").addEventListener("click", () => setMode(state.mode));
  $("#skip").addEventListener("click", () => finish(false));
  document.querySelectorAll(".modes button").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
  const task = $("#task");
  task.value = state.task;
  task.addEventListener("input", () => { state.task = task.value; save(); });
  task.addEventListener("keydown", (e) => { if (e.key === "Enter") task.blur(); });
  document.addEventListener("keydown", (e) => {
    const t = e.target instanceof Element ? e.target : null;
    if (e.code !== "Space" || e.repeat || (t && t.closest("input, textarea, select, button, dialog"))) return;
    e.preventDefault();
    state.running ? pause() : start();
  });

  /* ---------- settings ---------- */
  const dlg = $("#settings-dialog");
  function paintNotify() {
    const status = $("#notify-status"), btn = $("#notify-btn");
    if (!canNotify()) { status.textContent = "This browser doesn't support notifications."; btn.hidden = true; return; }
    const p = Notification.permission;
    status.textContent = p === "granted" ? "Notifications are on (shown when this tab is in the background)." : p === "denied" ? "Notifications are blocked in your browser's site settings." : "Desktop notifications are off.";
    btn.hidden = p !== "default";
  }
  $("#open-settings").addEventListener("click", () => {
    const s = state.settings;
    $("#s-focus").value = s.focus; $("#s-short").value = s.short; $("#s-long").value = s.long;
    $("#s-every").value = String(s.every); $("#s-auto").checked = s.autoStart; $("#s-sound").checked = s.sound;
    paintNotify();
    dlg.showModal();
  });
  $("#notify-btn").addEventListener("click", async () => { try { await Notification.requestPermission(); } catch (e) { /* ignore */ } paintNotify(); });
  $("#settings-cancel").addEventListener("click", () => dlg.close());
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
  $("#settings-form").addEventListener("submit", (e) => {
    e.preventDefault();
    unlockAudio();
    const before = state.settings;
    state.settings = normalize({ settings: {
      focus: $("#s-focus").value, short: $("#s-short").value, long: $("#s-long").value,
      every: $("#s-every").value, autoStart: $("#s-auto").checked, sound: $("#s-sound").checked,
    } }).settings;
    // A new length applies straight away only if this session hasn't started yet.
    if (!state.running && state.remaining === before[state.mode] * 60000) state.remaining = duration();
    dlg.close();
    save();
    paint();
    toast("Settings saved");
  });

  /* ---------- clear ---------- */
  document.querySelectorAll(".toolbar .menu").forEach((m) => m.addEventListener("click", async (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    closeMenus();
    const act = b.dataset.act, before = JSON.stringify(state);
    const undo = () => { state = normalize(JSON.parse(before)); save(); paint(); if (state.running) startTicker(); };
    if (act === "clear-today") {
      if (!state.stats.sessions && !state.round) { toast("Nothing to reset yet"); return; }
      if (!(await confirmBox("Reset today's count?", "This sets today's focus sessions and minutes back to zero and restarts the cycle to the long break.", "Reset count"))) return;
      state.stats = { date: todayKey(), sessions: 0, minutes: 0 };
      state.round = 0;
      save(); paint();
      toast("Today's count reset", undo);
    } else if (act === "reset-settings") {
      if (!(await confirmBox("Restore default settings?", "Focus 25 min, short break 5, long break 15 after every 4 sessions, sound on, auto-start off.", "Restore defaults"))) return;
      state.settings = { ...DEFAULTS };
      setMode(state.mode);
      toast("Default settings restored", undo);
    } else if (act === "reset") {
      if (!(await confirmBox("Reset everything?", "This stops the timer and deletes your settings, task and today's count from this browser.", "Reset everything"))) return;
      store.remove(KEY);
      state = normalize(null);
      task.value = "";
      save(); paint();
      toast("Everything reset", undo);
    }
  }));

  // Keep several open tabs in sync
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY) return;
    let next = null;
    try { next = e.newValue ? JSON.parse(e.newValue) : null; } catch (err) { next = null; }
    state = normalize(next);
    task.value = state.task;
    paint();
  });

  // A timer that ended while the page was closed finishes now.
  if (state.running && Date.now() >= state.endAt) finish();
  startTicker();
  paint();
})();
