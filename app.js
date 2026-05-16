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
  mode: "regular",   // "regular" | "star" | "photo"
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
  // Photo mode
  photo: {
    tool: "wand",        // "wand" | "erase" | "restore"
    tolerance: 28,
    brush: 40,
    loaded: false,
  },
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
  // Skip polygon rebuild in photo mode — the SVG is hidden, so it's wasted work
  // and avoids triggering NaN warnings if photo state ever leaks into polygon code.
  if (state.mode === "photo") return;
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

  // Filter selection. SVG only supports one `filter=` per element, so the
  // combined case uses a dedicated #shadowAndGlow filter that chains both.
  if (state.shadow && state.glow) path.setAttribute("filter", "url(#shadowAndGlow)");
  else if (state.shadow) path.setAttribute("filter", "url(#shadow)");
  else if (state.glow) path.setAttribute("filter", "url(#innerGlow)");
  else path.removeAttribute("filter");
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
  // Mode tabs (regular / star / photo)
  document.querySelectorAll('.seg-btn[data-mode]').forEach((b) => {
    b.addEventListener("click", () => {
      state.mode = b.dataset.mode;
      setActiveSeg(b.parentElement, state.mode, "mode");
      applyModeVisibility();
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

  // Rotation snap chips (scoped to those with a data-rot value; other .snap
  // chips like the photo-action buttons must not get this handler).
  document.querySelectorAll(".snap[data-rot]").forEach((b) => {
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

  // Photo mode
  initPhotoMode();

  applyModeVisibility();
  // First paint
  render();
}

function applyModeVisibility() {
  const photo = state.mode === "photo";
  $("#polygon-controls").hidden = photo;
  $("#photo-controls").hidden = !photo;
  $("#ratio-row").hidden = state.mode !== "star";
  // Toggle which preview surface is visible
  document.querySelector(".canvas-wrap").classList.toggle("has-photo", photo);
  $("#photo-canvas").hidden = !photo;
}

// ─── Export: SVG → PNG (or canvas → PNG in photo mode) ─────────────────────

/**
 * Returns the current sticker as a 1024×1024 transparent PNG blob.
 * In polygon modes: rasterizes the SVG. In photo mode: returns the canvas.
 */
function exportPng() {
  if (state.mode === "photo") return exportPhotoPng();
  return exportSvgPng();
}

function exportPhotoPng() {
  return new Promise((resolve, reject) => {
    const canvas = $("#photo-canvas");
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error("photo toBlob returned null"));
      else resolve(blob);
    }, "image/png");
  });
}

function exportSvgPng() {
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

// ─── Photo mode ────────────────────────────────────────────────────────────
//
// The photo canvas holds the working RGBA image at 1024×1024. We keep two
// extra ImageData snapshots:
//   - originalImageData  → pristine letterboxed source (for the Restore brush + Reset)
//   - undoStack          → up to 10 previous ImageData states (for Undo)
//
// Magic wand = stack-based flood-fill from the tapped pixel. Brushes paint
// alpha=0 (Eraser) or copy pixels from originalImageData (Restore).

const photo = {
  canvas: null,
  ctx: null,
  originalImageData: null,
  undoStack: [],
  isDragging: false,
  lastBrushX: null,
  lastBrushY: null,
};

const UNDO_LIMIT = 10;

function initPhotoMode() {
  photo.canvas = $("#photo-canvas");
  photo.ctx = photo.canvas.getContext("2d", { willReadFrequently: true });

  // File input
  $("#photo-file").addEventListener("change", (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) loadPhotoFile(f);
  });

  // Tool tabs
  document.querySelectorAll('#photo-controls .seg-btn[data-tool]').forEach((b) => {
    b.addEventListener("click", () => {
      state.photo.tool = b.dataset.tool;
      setActiveSeg(b.parentElement, state.photo.tool, "tool");
      $("#photo-tolerance-row").hidden = state.photo.tool !== "wand";
      $("#photo-brush-row").hidden = state.photo.tool === "wand";
    });
  });

  // Sliders
  $("#photo-tolerance").addEventListener("input", (e) => {
    state.photo.tolerance = parseInt(e.target.value, 10);
    $("#tol-out").textContent = state.photo.tolerance;
  });
  $("#photo-brush").addEventListener("input", (e) => {
    state.photo.brush = parseInt(e.target.value, 10);
    $("#brush-out").textContent = `${state.photo.brush}px`;
  });

  // Action chips
  $("#photo-undo").addEventListener("click", undoPhoto);
  $("#photo-reset").addEventListener("click", resetPhoto);
  $("#photo-crop").addEventListener("click", cropPhotoToSubject);
  $("#photo-auto").addEventListener("click", autoRemoveBackground);

  // Pointer interaction
  photo.canvas.addEventListener("pointerdown", onPhotoPointerDown);
  photo.canvas.addEventListener("pointermove", onPhotoPointerMove);
  photo.canvas.addEventListener("pointerup", onPhotoPointerUp);
  photo.canvas.addEventListener("pointercancel", onPhotoPointerUp);
}

function loadPhotoFile(file) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(url);
    drawImageContained(img);
    photo.originalImageData = photo.ctx.getImageData(0, 0, VIEW, VIEW);
    photo.undoStack.length = 0;
    state.photo.loaded = true;
    $("#photo-tools").hidden = false;
    $("#photo-tolerance-row").hidden = state.photo.tool !== "wand";
    $("#photo-brush-row").hidden = state.photo.tool === "wand";
    $("#photo-actions").hidden = false;
    $("#photo-file-label").textContent = "Change photo";
    toast("Tap the background to erase");
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    toast("Couldn't load that image");
  };
  img.src = url;
}

/**
 * Draw `img` centered on the photo canvas, scaled to fit within 1024×1024
 * preserving aspect ratio. Any letterbox area stays transparent.
 */
function drawImageContained(img) {
  photo.ctx.clearRect(0, 0, VIEW, VIEW);
  const r = Math.min(VIEW / img.naturalWidth, VIEW / img.naturalHeight);
  const w = img.naturalWidth * r;
  const h = img.naturalHeight * r;
  const x = (VIEW - w) / 2;
  const y = (VIEW - h) / 2;
  photo.ctx.drawImage(img, x, y, w, h);
}

function pushUndo() {
  const snap = photo.ctx.getImageData(0, 0, VIEW, VIEW);
  photo.undoStack.push(snap);
  if (photo.undoStack.length > UNDO_LIMIT) photo.undoStack.shift();
}

function undoPhoto() {
  const snap = photo.undoStack.pop();
  if (!snap) return toast("Nothing to undo");
  photo.ctx.putImageData(snap, 0, 0);
}

function resetPhoto() {
  if (!photo.originalImageData) return;
  pushUndo();
  photo.ctx.putImageData(photo.originalImageData, 0, 0);
}

// Pointer → canvas coordinate translation. The canvas is 1024² internal but
// CSS-scaled to fit the wrapper; map client coords back to image coords.
function canvasPointFromEvent(ev) {
  const rect = photo.canvas.getBoundingClientRect();
  const x = ((ev.clientX - rect.left) / rect.width) * VIEW;
  const y = ((ev.clientY - rect.top) / rect.height) * VIEW;
  return [Math.round(x), Math.round(y)];
}

function onPhotoPointerDown(ev) {
  if (!state.photo.loaded) return;
  ev.preventDefault();
  // setPointerCapture throws on synthetic events that lack a registered
  // pointer (some test harnesses, some browsers under unusual conditions).
  try { photo.canvas.setPointerCapture(ev.pointerId); } catch {}
  const [x, y] = canvasPointFromEvent(ev);
  if (state.photo.tool === "wand") {
    pushUndo();
    magicWand(x, y, state.photo.tolerance);
  } else {
    pushUndo();
    photo.isDragging = true;
    photo.lastBrushX = x; photo.lastBrushY = y;
    applyBrush(x, y);
  }
}

function onPhotoPointerMove(ev) {
  if (!photo.isDragging) return;
  const [x, y] = canvasPointFromEvent(ev);
  // Stamp along the line from last point to current so fast drags don't gap
  const dx = x - photo.lastBrushX, dy = y - photo.lastBrushY;
  const dist = Math.hypot(dx, dy);
  const step = Math.max(1, state.photo.brush / 3);
  const steps = Math.max(1, Math.floor(dist / step));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    applyBrush(photo.lastBrushX + dx * t, photo.lastBrushY + dy * t);
  }
  photo.lastBrushX = x; photo.lastBrushY = y;
}

function onPhotoPointerUp() {
  photo.isDragging = false;
  photo.lastBrushX = photo.lastBrushY = null;
}

function applyBrush(x, y) {
  const r = state.photo.brush / 2;
  if (state.photo.tool === "erase") {
    // Erase = clear alpha in circle
    photo.ctx.save();
    photo.ctx.globalCompositeOperation = "destination-out";
    photo.ctx.beginPath();
    photo.ctx.arc(x, y, r, 0, Math.PI * 2);
    photo.ctx.fillStyle = "rgba(0,0,0,1)";
    photo.ctx.fill();
    photo.ctx.restore();
  } else if (state.photo.tool === "restore") {
    // Restore = sample original pixels inside the circle, put them back
    if (!photo.originalImageData) return;
    const x0 = Math.max(0, Math.floor(x - r));
    const y0 = Math.max(0, Math.floor(y - r));
    const x1 = Math.min(VIEW, Math.ceil(x + r));
    const y1 = Math.min(VIEW, Math.ceil(y + r));
    const w = x1 - x0, h = y1 - y0;
    if (w <= 0 || h <= 0) return;
    const cur = photo.ctx.getImageData(x0, y0, w, h);
    const orig = photo.originalImageData.data;
    const r2 = r * r;
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const gx = x0 + px, gy = y0 + py;
        const ddx = gx - x, ddy = gy - y;
        if (ddx * ddx + ddy * ddy > r2) continue;
        const di = (py * w + px) * 4;
        const si = (gy * VIEW + gx) * 4;
        cur.data[di]     = orig[si];
        cur.data[di + 1] = orig[si + 1];
        cur.data[di + 2] = orig[si + 2];
        cur.data[di + 3] = orig[si + 3];
      }
    }
    photo.ctx.putImageData(cur, x0, y0);
  }
}

/**
 * Stack-based flood-fill from (x, y). Any pixel reachable through a 4-way
 * neighborhood whose RGB distance to the start pixel is ≤ `tolerance`
 * gets its alpha cleared. Tolerance scale is 0..120 in Euclidean RGB.
 */
function magicWand(x, y, tolerance) {
  const w = VIEW, h = VIEW;
  if (x < 0 || y < 0 || x >= w || y >= h) return;
  const img = photo.ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const i0 = (y * w + x) * 4;
  if (d[i0 + 3] === 0) return; // already transparent
  const tr = d[i0], tg = d[i0 + 1], tb = d[i0 + 2];
  const tolSq = tolerance * tolerance;

  // Track which pixels we've considered (bit per pixel via Uint8Array)
  const seen = new Uint8Array(w * h);
  const stack = [x + y * w];
  seen[x + y * w] = 1;

  while (stack.length) {
    const p = stack.pop();
    const i = p * 4;
    if (d[i + 3] === 0) continue;
    const dr = d[i] - tr, dg = d[i + 1] - tg, db = d[i + 2] - tb;
    if (dr * dr + dg * dg + db * db > tolSq) continue;
    // Soft alpha falloff at the tolerance boundary for nicer edges
    const dist2 = dr * dr + dg * dg + db * db;
    if (dist2 > tolSq * 0.7) {
      // partial transparent → blend toward 0
      const k = 1 - (dist2 - tolSq * 0.7) / (tolSq * 0.3);
      d[i + 3] = Math.round(d[i + 3] * (1 - k));
    } else {
      d[i + 3] = 0;
    }
    const px = p % w, py = (p - px) / w;
    if (px > 0)     { const n = p - 1;  if (!seen[n]) { seen[n] = 1; stack.push(n); } }
    if (px < w - 1) { const n = p + 1;  if (!seen[n]) { seen[n] = 1; stack.push(n); } }
    if (py > 0)     { const n = p - w;  if (!seen[n]) { seen[n] = 1; stack.push(n); } }
    if (py < h - 1) { const n = p + w;  if (!seen[n]) { seen[n] = 1; stack.push(n); } }
  }
  photo.ctx.putImageData(img, 0, 0);
}

/**
 * Find the tight bounding box of opaque (alpha > 8) pixels and rescale so the
 * subject fills the canvas with a 4% margin on the larger axis. Letterbox
 * stays transparent. Updates originalImageData so future Restore/Reset use
 * the new cropped baseline.
 */
function cropPhotoToSubject() {
  if (!state.photo.loaded) return;
  const w = VIEW, h = VIEW;
  const img = photo.ctx.getImageData(0, 0, w, h);
  const d = img.data;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 8) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return toast("Nothing to crop — image is empty");
  const cw = maxX - minX + 1, ch = maxY - minY + 1;
  // Pull the cropped region into a temp canvas, then redraw at fit-scale.
  const tmp = document.createElement("canvas");
  tmp.width = cw; tmp.height = ch;
  tmp.getContext("2d").putImageData(photo.ctx.getImageData(minX, minY, cw, ch), 0, 0);
  pushUndo();
  photo.ctx.clearRect(0, 0, w, h);
  const margin = 0.04;
  const r = (1 - margin * 2) * Math.min(w / cw, h / ch);
  const nw = cw * r, nh = ch * r;
  photo.ctx.drawImage(tmp, (w - nw) / 2, (h - nh) / 2, nw, nh);
  // Update originalImageData to the cropped baseline (Restore brushes after a
  // crop should pull from the cropped subject, not the pre-crop full image).
  photo.originalImageData = photo.ctx.getImageData(0, 0, w, h);
  toast("Cropped");
}

/**
 * Lazy-load @imgly/background-removal from a CDN and run it on the current
 * canvas pixels. The library downloads a ~30 MB ONNX model the first time;
 * Cache-API persists it across visits so subsequent runs are instant.
 */
async function autoRemoveBackground() {
  if (!state.photo.loaded) return;
  const btn = $("#photo-auto");
  const origText = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Loading model…";
  try {
    // First-time use will download the model — keep the user informed
    toast("Downloading model… first time only, ~30 MB", 4500);
    const mod = await import(
      /* @vite-ignore */
      "https://esm.sh/@imgly/background-removal@1.6.0"
    );
    btn.textContent = "Working…";
    const blob = await new Promise((res, rej) => {
      photo.canvas.toBlob((b) => b ? res(b) : rej(new Error("toBlob failed")), "image/png");
    });
    const result = await mod.removeBackground(blob);
    const url = URL.createObjectURL(result);
    const img = new Image();
    await new Promise((res, rej) => {
      img.onload = res; img.onerror = rej; img.src = url;
    });
    pushUndo();
    photo.ctx.clearRect(0, 0, VIEW, VIEW);
    // Result is the same dims as the input; draw it back in place
    photo.ctx.drawImage(img, 0, 0, VIEW, VIEW);
    URL.revokeObjectURL(url);
    photo.originalImageData = photo.ctx.getImageData(0, 0, VIEW, VIEW);
    toast("Background removed");
  } catch (e) {
    console.error("auto-remove failed:", e);
    toast("Auto-remove failed — try magic wand");
  } finally {
    btn.disabled = false;
    btn.textContent = origText;
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
