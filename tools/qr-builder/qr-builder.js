(() => {
  "use strict";
  const KEY = "parottasalna.qr-builder.v1";
  const { $, store, showSaved, toast } = window.PTools;

  // Encode text as UTF-8 so Tamil and other scripts scan correctly.
  qrcode.stringToBytes = qrcode.stringToBytesFuncs["UTF-8"];

  // Same defaults as the Python qr-builder: high error correction, 4-module border, black on white.
  const DEFAULTS = { text: "https://parottasalna.com/", size: 500, ecc: "H", margin: 4, fg: "#000000", bg: "#ffffff", filename: "qrcode" };
  const ECC_LABEL = { L: "~7%", M: "~15%", Q: "~25%", H: "~30%" };

  const clampInt = (v, min, max, fallback) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback; };
  const isColor = (c) => /^#[0-9a-f]{6}$/i.test(c || "");

  function normalize(o) {
    o = o && typeof o === "object" ? o : {};
    return {
      text: typeof o.text === "string" ? o.text.slice(0, 2900) : DEFAULTS.text,
      size: clampInt(o.size, 64, 4096, DEFAULTS.size),
      ecc: ["L", "M", "Q", "H"].includes(o.ecc) ? o.ecc : DEFAULTS.ecc,
      margin: [0, 1, 2, 4, 6].includes(Number(o.margin)) ? Number(o.margin) : DEFAULTS.margin,
      fg: isColor(o.fg) ? o.fg.toLowerCase() : DEFAULTS.fg,
      bg: isColor(o.bg) ? o.bg.toLowerCase() : DEFAULTS.bg,
      filename: typeof o.filename === "string" ? o.filename.slice(0, 60) : DEFAULTS.filename,
    };
  }

  let opts = normalize(store.read(KEY));
  let qr = null; // the current encoded QR, or null when there's nothing valid to show

  /* ---------- form ---------- */
  const f = {
    text: $("#text"), size: $("#size"), ecc: $("#ecc"), margin: $("#margin"),
    fg: $("#fg"), bg: $("#bg"), filename: $("#filename"),
  };
  function fillForm() {
    f.text.value = opts.text; f.size.value = opts.size; f.ecc.value = opts.ecc; f.margin.value = String(opts.margin);
    f.fg.value = opts.fg; f.bg.value = opts.bg; f.filename.value = opts.filename;
  }
  function readForm() {
    opts = normalize({
      text: f.text.value, size: f.size.value, ecc: f.ecc.value, margin: f.margin.value,
      fg: f.fg.value, bg: f.bg.value, filename: f.filename.value,
    });
  }

  /* ---------- drawing ---------- */
  // Draws the code at exactly size×size pixels; module edges are rounded so they stay crisp.
  function draw(canvas, size) {
    const count = qr.getModuleCount(), n = count + opts.margin * 2;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = opts.bg;
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = opts.fg;
    const edge = (i) => Math.round((i * size) / n);
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) {
        if (!qr.isDark(r, c)) continue;
        const x = edge(c + opts.margin), y = edge(r + opts.margin);
        ctx.fillRect(x, y, edge(c + opts.margin + 1) - x, edge(r + opts.margin + 1) - y);
      }
    }
  }

  // SVG with one path; runs of dark modules in a row become a single rectangle.
  function toSVG() {
    const count = qr.getModuleCount(), n = count + opts.margin * 2;
    let d = "";
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) {
        if (!qr.isDark(r, c)) continue;
        let len = 1;
        while (c + len < count && qr.isDark(r, c + len)) len++;
        d += "M" + (c + opts.margin) + " " + (r + opts.margin) + "h" + len + "v1h-" + len + "z";
        c += len - 1;
      }
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + n + " " + n + '" width="' + opts.size + '" height="' + opts.size + '" shape-rendering="crispEdges">' +
      '<rect width="100%" height="100%" fill="' + opts.bg + '"/><path fill="' + opts.fg + '" d="' + d + '"/></svg>';
  }

  /* ---------- contrast check ---------- */
  function luminance(hex) {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const v = parseInt(hex.slice(i, i + 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  function contrastWarning() {
    const lf = luminance(opts.fg), lb = luminance(opts.bg);
    const ratio = (Math.max(lf, lb) + 0.05) / (Math.min(lf, lb) + 0.05);
    if (ratio < 3) return "Low contrast between the code and background colours — many phones won't be able to scan it.";
    if (lf > lb) return "The code is lighter than the background (inverted). Some scanner apps can't read inverted codes — dark on light is safest.";
    if (opts.margin < 2) return "A quiet zone smaller than 2 modules can make the code hard to scan when it's placed next to other content.";
    return "";
  }

  /* ---------- render ---------- */
  function render() {
    const text = opts.text;
    const bytes = new TextEncoder().encode(text).length;
    $("#char-count").textContent = text ? bytes + " bytes" : "";
    $("#empty").hidden = Boolean(text);
    $("#error").hidden = true;
    qr = null;

    if (text) {
      try {
        qr = qrcode(0, opts.ecc);
        qr.addData(text, "Byte");
        qr.make();
      } catch (e) {
        qr = null;
        $("#error").textContent = "That's too much text for a QR code at this error-correction level. Shorten it, or choose a lower level (Low holds the most).";
        $("#error").hidden = false;
      }
    }

    const ok = Boolean(qr);
    ["#dl-png", "#dl-svg", "#copy"].forEach((s) => ($(s).disabled = !ok));
    document.querySelectorAll(".presets button").forEach((b) => b.classList.toggle("active", Number(b.dataset.size) === opts.size));
    const warning = ok ? contrastWarning() : "";
    $("#contrast-warning").textContent = warning ? "⚠ " + warning : "";
    $("#contrast-warning").hidden = !warning;

    if (!ok) {
      $("#info").textContent = "";
      const ctx = $("#canvas").getContext("2d");
      ctx.clearRect(0, 0, $("#canvas").width, $("#canvas").height);
      return;
    }
    const count = qr.getModuleCount();
    draw($("#canvas"), opts.size);
    $("#info").textContent = "Version " + (count - 17) / 4 + " · " + count + "×" + count + " modules · " + ECC_LABEL[opts.ecc] + " recoverable · " + opts.size + "×" + opts.size + " px";
  }

  let timer;
  function update() {
    readForm();
    clearTimeout(timer);
    timer = setTimeout(() => { render(); showSaved(store.write(KEY, opts)); }, 120);
  }

  /* ---------- downloads ---------- */
  const baseName = () => (opts.filename.replace(/\.(png|svg)$/i, "").replace(/[^\w.-]+/g, "-").replace(/^[-.]+|[-.]+$/g, "") || "qrcode");
  function saveBlob(blob, name) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  const pngBlob = () => new Promise((resolve) => $("#canvas").toBlob(resolve, "image/png"));

  $("#dl-png").addEventListener("click", async () => {
    if (!qr) return;
    saveBlob(await pngBlob(), baseName() + ".png");
    toast("Saved " + baseName() + ".png (" + opts.size + "×" + opts.size + " px)");
  });
  $("#dl-svg").addEventListener("click", () => {
    if (!qr) return;
    saveBlob(new Blob([toSVG()], { type: "image/svg+xml" }), baseName() + ".svg");
    toast("Saved " + baseName() + ".svg");
  });
  $("#copy").addEventListener("click", async () => {
    if (!qr) return;
    if (!navigator.clipboard || !window.ClipboardItem) { toast("Your browser can't copy images — use Download PNG instead"); return; }
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": pngBlob() })]);
      toast("QR code copied — paste it anywhere");
    } catch (e) {
      toast("Couldn't copy the image — use Download PNG instead");
    }
  });

  /* ---------- events ---------- */
  $("#qr-form").addEventListener("submit", (e) => e.preventDefault());
  Object.values(f).forEach((input) => input.addEventListener("input", update));
  f.size.addEventListener("change", () => { f.size.value = normalize({ size: f.size.value }).size; update(); });
  document.querySelectorAll(".presets button").forEach((b) => b.addEventListener("click", () => { f.size.value = b.dataset.size; update(); }));
  $("#reset").addEventListener("click", () => {
    const before = opts;
    opts = { ...DEFAULTS };
    fillForm(); render(); showSaved(store.write(KEY, opts));
    toast("Back to the defaults", () => { opts = before; fillForm(); render(); showSaved(store.write(KEY, opts)); });
  });

  fillForm();
  render();
})();
