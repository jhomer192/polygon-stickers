// Sticker Maker — photo → transparent PNG → iOS sticker drawer.
//
// One canvas, three brushes (magic wand, eraser, restore), crop-to-subject,
// optional AI background remover. Everything runs locally; nothing uploads.

const VIEW = 1024;          // canvas resolution
const UNDO_LIMIT = 10;

const state = {
  tool: "wand",             // "wand" | "erase" | "restore" | "paint"
  tolerance: 28,
  brush: 60,
  paintColor: "#000000",
  loaded: false,
};

// Paint palette — high-contrast colors for annotating stickers
const PAINT_COLORS = [
  "#000000", "#ffffff", "#ff3b3b", "#ff8a3d",
  "#ffd23f", "#7cd05c", "#4fc3ff", "#a259ff",
];

const $ = (sel) => document.querySelector(sel);

// ─── Toast ─────────────────────────────────────────────────────────────────

function toast(msg, ms = 1800) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("show"), ms);
}

// ─── Photo canvas state ────────────────────────────────────────────────────

const photo = {
  canvas: null,
  ctx: null,
  originalImageData: null,  // pristine letterboxed source (for Restore + Reset)
  undoStack: [],            // up to UNDO_LIMIT prior ImageData snapshots
  isDragging: false,
  lastBrushX: null,
  lastBrushY: null,
};

// ─── Init ──────────────────────────────────────────────────────────────────

function init() {
  photo.canvas = $("#photo-canvas");
  photo.ctx = photo.canvas.getContext("2d", { willReadFrequently: true });

  // File input
  $("#photo-file").addEventListener("change", (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) loadPhotoFile(f);
  });

  // Tool tabs
  document.querySelectorAll('.seg-btn[data-tool]').forEach((b) => {
    b.addEventListener("click", () => {
      state.tool = b.dataset.tool;
      setActiveTool();
    });
  });

  // Paint color palette
  buildPaintPalette();

  // Sliders
  $("#photo-tolerance").addEventListener("input", (e) => {
    state.tolerance = parseInt(e.target.value, 10);
    $("#tol-out").textContent = state.tolerance;
  });
  $("#photo-brush").addEventListener("input", (e) => {
    state.brush = parseInt(e.target.value, 10);
    $("#brush-out").textContent = `${state.brush}px`;
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
  // Cursor preview — a hover ring showing exactly what your brush will hit.
  // Makes the eraser/paint/restore tools feel like normal drawing apps
  // instead of "tap and hope."
  photo.canvas.addEventListener("pointermove", onCursorPreview);
  photo.canvas.addEventListener("pointerleave", hideCursor);

  // iOS Safari bug: touch-action:none + ev.preventDefault() inside a
  // pointerdown handler does NOT reliably stop the browser from scrolling
  // when you drag on the canvas. The only thing that does is a non-passive
  // touchstart/touchmove listener that calls preventDefault synchronously.
  // We attach those at the canvas level so dragging the eraser/paint/restore
  // brush never scrolls the page.
  const blockTouch = (e) => {
    if (state.loaded) e.preventDefault();
  };
  photo.canvas.addEventListener("touchstart", blockTouch, { passive: false });
  photo.canvas.addEventListener("touchmove", blockTouch, { passive: false });

  // Actions
  $("#btn-share").addEventListener("click", onShare);
  $("#btn-copy").addEventListener("click", onCopy);
}

function setActiveTool() {
  document.querySelectorAll('.seg-btn[data-tool]').forEach((b) => {
    const on = b.dataset.tool === state.tool;
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
  });
  $("#photo-tolerance-row").hidden = state.tool !== "wand";
  $("#photo-brush-row").hidden = state.tool === "wand";
  $("#photo-paint-row").hidden = state.tool !== "paint";
}

function buildPaintPalette() {
  const root = $("#paint-palette");
  if (!root) return;
  root.innerHTML = "";
  for (const c of PAINT_COLORS) {
    const b = document.createElement("button");
    b.className = "swatch";
    b.style.background = c;
    b.dataset.color = c;
    b.setAttribute("aria-label", c);
    if (c === state.paintColor) b.classList.add("active");
    b.addEventListener("click", () => {
      state.paintColor = c;
      root.querySelectorAll(".swatch").forEach((s) => s.classList.remove("active"));
      b.classList.add("active");
    });
    root.appendChild(b);
  }
}

// ─── Loading a photo ───────────────────────────────────────────────────────

function loadPhotoFile(file) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(url);
    drawImageContained(img);
    photo.originalImageData = photo.ctx.getImageData(0, 0, VIEW, VIEW);
    photo.undoStack.length = 0;
    state.loaded = true;
    $("#photo-tools").hidden = false;
    $("#photo-actions").hidden = false;
    setActiveTool();
    $("#photo-file-label").textContent = "Change photo";
    toast("Tap the background to erase");
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    toast("Couldn't load that image");
  };
  img.src = url;
}

/** Draw `img` centered on the canvas, contained within 1024² (preserves aspect). */
function drawImageContained(img) {
  photo.ctx.clearRect(0, 0, VIEW, VIEW);
  const r = Math.min(VIEW / img.naturalWidth, VIEW / img.naturalHeight);
  const w = img.naturalWidth * r;
  const h = img.naturalHeight * r;
  const x = (VIEW - w) / 2;
  const y = (VIEW - h) / 2;
  photo.ctx.drawImage(img, x, y, w, h);
}

// ─── Undo / Reset ──────────────────────────────────────────────────────────

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

// ─── Pointer → canvas coords ───────────────────────────────────────────────

function canvasPointFromEvent(ev) {
  const rect = photo.canvas.getBoundingClientRect();
  const x = ((ev.clientX - rect.left) / rect.width) * VIEW;
  const y = ((ev.clientY - rect.top) / rect.height) * VIEW;
  return [Math.round(x), Math.round(y)];
}

function onPhotoPointerDown(ev) {
  if (!state.loaded) return;
  ev.preventDefault();
  // setPointerCapture throws on synthetic events that lack a registered pointer.
  try { photo.canvas.setPointerCapture(ev.pointerId); } catch {}
  const [x, y] = canvasPointFromEvent(ev);
  if (state.tool === "wand") {
    pushUndo();
    magicWand(x, y, state.tolerance);
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
  const step = Math.max(1, state.brush / 3);
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

// ─── Cursor preview ────────────────────────────────────────────────────────
//
// Draws a ring on top of the canvas at the pointer location, sized to match
// the brush diameter. The wand has no brush radius, so we show a small
// crosshair instead. The cursor is a separate DOM element layered over the
// canvas (a div with border-radius:50%) so it doesn't mutate canvas pixels.

function onCursorPreview(ev) {
  if (!state.loaded) return;
  const cur = $("#brush-cursor");
  if (!cur) return;
  const rect = photo.canvas.getBoundingClientRect();
  // Brush size is in canvas (1024) units; convert to CSS px for the overlay
  const scale = rect.width / VIEW;
  const size = state.tool === "wand" ? 14 : state.brush * scale;
  cur.style.width = `${size}px`;
  cur.style.height = `${size}px`;
  cur.style.left = `${ev.clientX - rect.left}px`;
  cur.style.top = `${ev.clientY - rect.top}px`;
  cur.classList.toggle("crosshair", state.tool === "wand");
  cur.classList.add("show");
}

function hideCursor() {
  const cur = $("#brush-cursor");
  if (cur) cur.classList.remove("show");
}

// ─── Brushes ───────────────────────────────────────────────────────────────

function applyBrush(x, y) {
  const r = state.brush / 2;
  if (state.tool === "erase") {
    photo.ctx.save();
    photo.ctx.globalCompositeOperation = "destination-out";
    photo.ctx.beginPath();
    photo.ctx.arc(x, y, r, 0, Math.PI * 2);
    photo.ctx.fillStyle = "rgba(0,0,0,1)";
    photo.ctx.fill();
    photo.ctx.restore();
  } else if (state.tool === "paint") {
    // Paint opaque pixels — used to extend/draw on the subject (annotate,
    // fill holes, add arrows, recolor regions).
    photo.ctx.save();
    photo.ctx.globalCompositeOperation = "source-over";
    photo.ctx.beginPath();
    photo.ctx.arc(x, y, r, 0, Math.PI * 2);
    photo.ctx.fillStyle = state.paintColor;
    photo.ctx.fill();
    photo.ctx.restore();
  } else if (state.tool === "restore") {
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

// ─── Magic wand (flood-fill on RGB distance with soft alpha falloff) ───────

function magicWand(x, y, tolerance) {
  const w = VIEW, h = VIEW;
  if (x < 0 || y < 0 || x >= w || y >= h) return;
  const img = photo.ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const i0 = (y * w + x) * 4;
  if (d[i0 + 3] === 0) return; // already transparent
  const tr = d[i0], tg = d[i0 + 1], tb = d[i0 + 2];
  const tolSq = tolerance * tolerance;

  const seen = new Uint8Array(w * h);
  const stack = [x + y * w];
  seen[x + y * w] = 1;

  while (stack.length) {
    const p = stack.pop();
    const i = p * 4;
    if (d[i + 3] === 0) continue;
    const dr = d[i] - tr, dg = d[i + 1] - tg, db = d[i + 2] - tb;
    const dist2 = dr * dr + dg * dg + db * db;
    if (dist2 > tolSq) continue;
    if (dist2 > tolSq * 0.7) {
      // Soft alpha falloff at the tolerance boundary for nicer edges
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

// ─── Crop to subject ───────────────────────────────────────────────────────

function cropPhotoToSubject() {
  if (!state.loaded) return;
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
  const tmp = document.createElement("canvas");
  tmp.width = cw; tmp.height = ch;
  tmp.getContext("2d").putImageData(photo.ctx.getImageData(minX, minY, cw, ch), 0, 0);
  pushUndo();
  photo.ctx.clearRect(0, 0, w, h);
  const margin = 0.04;
  const r = (1 - margin * 2) * Math.min(w / cw, h / ch);
  const nw = cw * r, nh = ch * r;
  photo.ctx.drawImage(tmp, (w - nw) / 2, (h - nh) / 2, nw, nh);
  photo.originalImageData = photo.ctx.getImageData(0, 0, w, h);
  toast("Cropped");
}

// ─── Auto background removal (lazy-loaded ML model) ────────────────────────

async function autoRemoveBackground() {
  if (!state.loaded) return;
  const btn = $("#photo-auto");
  const origText = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Loading model…";
  try {
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

// ─── Export ────────────────────────────────────────────────────────────────

function exportPng() {
  return new Promise((resolve, reject) => {
    photo.canvas.toBlob((blob) => {
      if (!blob) reject(new Error("toBlob returned null"));
      else resolve(blob);
    }, "image/png");
  });
}

async function onShare() {
  if (!state.loaded) return toast("Choose a photo first");
  try {
    const blob = await exportPng();
    const file = new File([blob], `sticker-${Date.now()}.png`, { type: "image/png" });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "Sticker" });
        return;
      } catch (err) {
        if (err && err.name === "AbortError") return;
      }
    }

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
  if (!state.loaded) return toast("Choose a photo first");
  try {
    const blob = await exportPng();
    if (!navigator.clipboard || !window.ClipboardItem) {
      throw new Error("Clipboard image not supported");
    }
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    toast("Copied — paste into Messages");
  } catch (e) {
    console.error(e);
    toast("Copy not supported on this device");
  }
}

// ─── Service worker registration ───────────────────────────────────────────

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("service-worker.js")
      .catch((err) => console.warn("SW registration failed:", err));
  });
}

init();
