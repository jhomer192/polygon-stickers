// Polygon Stickers — vanilla JS
//
// Single file because the whole thing is small enough to read top-to-bottom.
// State lives in `state`. Every change calls `render()` which rebuilds the
// SVG path + applies fill/stroke/effects. Export rasterizes the live SVG to
// a 1024×1024 transparent PNG via canvas, then fires Web Share or download.

const VIEW = 1024;       // SVG viewBox + canvas export resolution
const CENTER = VIEW / 2;
const MARGIN = 90;       // gap from sticker edge so stroke/glow don't clip
const RADIUS = CENTER - MARGIN;

// 14 swatches — vibrant + neutrals. Chosen to look good against transparent.
const PALETTE = [
  "#ff6ec7", "#ff3b3b", "#ff8a3d", "#ffd23f", "#7cd05c",
  "#4fc3ff", "#a259ff", "#ff5ea8",
  "#ffffff", "#000000", "#5a6478", "#b0b9c9",
  "#ff2d92", "#00d4aa",
];

const state = {
  sides: 6,
  mode: "regular",   // "regular" | "star"
  ratio: 0.45,       // star inner/outer
  rotation: 0,       // degrees
  fillKind: "solid", // "solid" | "gradient"
  fillColor: "#ff6ec7",
  gradColor1: "#ff6ec7",
  gradColor2: "#4fc3ff",
  gradAngle: 135,
  strokeColor: "#ffffff",
  strokeWidth: 0,
  shadow: false,
  glow: false,
};

// ─── Polygon math ──────────────────────────────────────────────────────────

/** Build the path data for the current shape. */
function polygonPath() {
  const rot = (state.rotation - 90) * Math.PI / 180; // top-up at rotation=0
  const pts = [];
  if (state.mode === "regular") {
    const n = state.sides;
    for (let i = 0; i < n; i++) {
      const a = rot + (2 * Math.PI * i) / n;
      pts.push([CENTER + Math.cos(a) * RADIUS, CENTER + Math.sin(a) * RADIUS]);
    }
  } else { // star
    const n = state.sides;
    const inner = RADIUS * state.ratio;
    for (let i = 0; i < n * 2; i++) {
      const a = rot + (Math.PI * i) / n;
      const r = (i % 2 === 0) ? RADIUS : inner;
      pts.push([CENTER + Math.cos(a) * r, CENTER + Math.sin(a) * r]);
    }
  }
  return "M" + pts.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join(" L") + " Z";
}

// ─── Render ────────────────────────────────────────────────────────────────

const $ = (sel) => document.querySelector(sel);
const path = $("#poly");
const gradEl = document.querySelector("#fill-gradient");
const gradStops = gradEl.querySelectorAll("stop");

function render() {
  // Path
  path.setAttribute("d", polygonPath());

  // Fill
  if (state.fillKind === "solid") {
    path.setAttribute("fill", state.fillColor);
  } else {
    // Configure gradient direction by setting x1/y1/x2/y2 from angle
    const a = state.gradAngle * Math.PI / 180;
    // Compute the two endpoints on the unit square mapped from angle
    const cx = 0.5, cy = 0.5, len = 0.5;
    gradEl.setAttribute("x1", cx - Math.cos(a) * len);
    gradEl.setAttribute("y1", cy - Math.sin(a) * len);
    gradEl.setAttribute("x2", cx + Math.cos(a) * len);
    gradEl.setAttribute("y2", cy + Math.sin(a) * len);
    gradStops[0].setAttribute("stop-color", state.gradColor1);
    gradStops[1].setAttribute("stop-color", state.gradColor2);
    path.setAttribute("fill", "url(#fill-gradient)");
  }

  // Stroke
  if (state.strokeWidth > 0) {
    path.setAttribute("stroke", state.strokeColor);
    path.setAttribute("stroke-width", state.strokeWidth);
    path.setAttribute("stroke-linejoin", "round");
  } else {
    path.removeAttribute("stroke");
    path.removeAttribute("stroke-width");
  }

  // Filter chain (shadow, glow). SVG only supports one `filter=` so combine.
  const filters = [];
  if (state.glow) filters.push("url(#innerGlow)");
  if (state.shadow) filters.push("url(#shadow)");
  if (filters.length === 0) path.removeAttribute("filter");
  else path.setAttribute("filter", filters[0]); // if both, prefer shadow over glow
  // Real combined-filter compositing is a chain in <filter>; v1 keeps it simple.
  if (state.shadow && state.glow) {
    path.setAttribute("filter", "url(#shadow)");
  }
}

// ─── UI wiring ─────────────────────────────────────────────────────────────

function setActiveSeg(group, value, attr) {
  group.querySelectorAll(".seg-btn").forEach((b) => {
    const on = b.dataset[attr] === value;
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
  });
}

function buildPalette(rootEl, target, includeNone = false) {
  rootEl.innerHTML = "";
  if (includeNone) {
    const b = document.createElement("button");
    b.className = "swatch none";
    b.dataset.color = "none";
    b.title = "None";
    b.setAttribute("aria-label", "No stroke");
    rootEl.appendChild(b);
  }
  for (const c of PALETTE) {
    const b = document.createElement("button");
    b.className = "swatch";
    b.style.background = c;
    b.dataset.color = c;
    b.setAttribute("aria-label", c);
    rootEl.appendChild(b);
  }
  rootEl.addEventListener("click", (e) => {
    const b = e.target.closest(".swatch");
    if (!b) return;
    rootEl.querySelectorAll(".swatch").forEach((s) => s.classList.remove("active"));
    b.classList.add("active");
    if (target === "fill") state.fillColor = b.dataset.color;
    else if (target === "grad1") state.gradColor1 = b.dataset.color;
    else if (target === "grad2") state.gradColor2 = b.dataset.color;
    else if (target === "stroke") state.strokeColor = b.dataset.color;
    render();
  });
}

function init() {
  // Mode tabs
  const modeSeg = document.querySelector('.seg[role="tablist"]') ||
                  document.querySelector('.seg');
  document.querySelectorAll('.seg-btn[data-mode]').forEach((b) => {
    b.addEventListener("click", () => {
      state.mode = b.dataset.mode;
      setActiveSeg(b.parentElement, state.mode, "mode");
      $("#ratio-row").hidden = state.mode !== "star";
      render();
    });
  });

  // Fill kind tabs
  document.querySelectorAll('.seg-btn[data-fill]').forEach((b) => {
    b.addEventListener("click", () => {
      state.fillKind = b.dataset.fill;
      setActiveSeg(b.parentElement, state.fillKind, "fill");
      $("#solid-row").hidden = state.fillKind !== "solid";
      $("#grad-row").hidden = state.fillKind !== "gradient";
      render();
    });
  });

  // Sliders
  const wireSlider = (id, key, outId, fmt = (v) => v) => {
    const el = $(`#${id}`);
    const out = outId ? $(`#${outId}`) : null;
    el.addEventListener("input", () => {
      const v = el.type === "range" && el.step.indexOf(".") >= 0
        ? parseFloat(el.value)
        : (el.step.indexOf(".") < 0 ? parseInt(el.value, 10) : parseFloat(el.value));
      state[key] = v;
      if (out) out.textContent = fmt(v);
      render();
    });
  };
  wireSlider("sides", "sides", "sides-out");
  wireSlider("ratio", "ratio", "ratio-out", (v) => v.toFixed(2));
  wireSlider("rotation", "rotation", "rot-out", (v) => `${v}°`);
  wireSlider("grad-angle", "gradAngle", "grad-angle-out", (v) => `${v}°`);
  wireSlider("stroke-w", "strokeWidth", "stroke-out", (v) => `${v}px`);

  // Rotation snap chips
  document.querySelectorAll(".snap").forEach((b) => {
    b.addEventListener("click", () => {
      const r = parseInt(b.dataset.rot, 10);
      state.rotation = r;
      $("#rotation").value = r;
      $("#rot-out").textContent = `${r}°`;
      render();
    });
  });

  // Palettes
  buildPalette($("#palette-1"), "fill");
  buildPalette($("#palette-grad1"), "grad1");
  buildPalette($("#palette-grad2"), "grad2");
  buildPalette($("#palette-stroke"), "stroke");

  // Mark initial active swatches
  const mark = (rootSel, color) => {
    document.querySelectorAll(`${rootSel} .swatch`).forEach((s) => {
      if (s.dataset.color === color) s.classList.add("active");
    });
  };
  mark("#palette-1", state.fillColor);
  mark("#palette-grad1", state.gradColor1);
  mark("#palette-grad2", state.gradColor2);
  mark("#palette-stroke", state.strokeColor);

  // Effects
  $("#fx-shadow").addEventListener("change", (e) => {
    state.shadow = e.target.checked;
    render();
  });
  $("#fx-glow").addEventListener("change", (e) => {
    state.glow = e.target.checked;
    render();
  });

  // Actions
  $("#btn-share").addEventListener("click", onShare);
  $("#btn-copy").addEventListener("click", onCopy);

  // First paint
  render();
}

// ─── Export: SVG → PNG ─────────────────────────────────────────────────────

/**
 * Serialize the live SVG to a transparent PNG blob at VIEW×VIEW.
 * Returns Promise<Blob>.
 */
function exportPng() {
  return new Promise((resolve, reject) => {
    const svg = $("#preview");
    // Clone so we can pin width/height without affecting the live element
    const clone = svg.cloneNode(true);
    clone.setAttribute("width", VIEW);
    clone.setAttribute("height", VIEW);
    // Ensure xmlns is set (cloneNode usually keeps it but be defensive)
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const xml = new XMLSerializer().serializeToString(clone);
    const svgBlob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = VIEW;
      canvas.height = VIEW;
      const ctx = canvas.getContext("2d");
      // DO NOT fill — keep alpha
      ctx.drawImage(img, 0, 0, VIEW, VIEW);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        if (!blob) reject(new Error("toBlob returned null"));
        else resolve(blob);
      }, "image/png");
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(new Error("SVG image load failed: " + e));
    };
    img.src = url;
  });
}

// ─── Share / Copy ──────────────────────────────────────────────────────────

function toast(msg, ms = 1800) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("show"), ms);
}

async function onShare() {
  try {
    const blob = await exportPng();
    const file = new File([blob], `polygon-${Date.now()}.png`, { type: "image/png" });

    // Prefer native share sheet (iOS shows Save to Photos, Save to Files, Messages, etc).
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "Polygon Sticker" });
        return;
      } catch (err) {
        // User cancelled — that's fine, don't fallback to download
        if (err && err.name === "AbortError") return;
        // Real error — fall through to download
      }
    }

    // Download fallback (desktop, or iOS Safari pre-15)
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast("Saved");
  } catch (e) {
    console.error(e);
    toast("Save failed — try Copy instead");
  }
}

async function onCopy() {
  try {
    const blob = await exportPng();
    if (!navigator.clipboard || !window.ClipboardItem) {
      throw new Error("Clipboard image not supported");
    }
    await navigator.clipboard.write([
      new ClipboardItem({ "image/png": blob }),
    ]);
    toast("Copied — paste into Messages");
  } catch (e) {
    console.error(e);
    toast("Copy not supported on this device");
  }
}

// ─── Service worker registration ────────────────────────────────────────────

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("service-worker.js")
      .catch((err) => console.warn("SW registration failed:", err));
  });
}

// Kick off
init();
