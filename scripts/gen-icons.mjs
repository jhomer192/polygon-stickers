// Generate icon-180.png, icon-192.png, icon-512.png using pngjs.
// Renders a hot-pink → cyan 6-point star on a dark navy rounded background.
// No browser, no native deps — runs anywhere with node.

import { PNG } from "pngjs";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..");

const BG = [0x0b, 0x0d, 0x12, 0xff];          // App background navy
const STROKE = [0xff, 0xff, 0xff, 0xff];      // White star stroke

// Gradient endpoints (hot pink → cyan)
const G1 = [0xff, 0x6e, 0xc7];
const G2 = [0x4f, 0xc3, 0xff];

function lerp(a, b, t) { return Math.round(a + (b - a) * t); }
function gradient(t) { return [lerp(G1[0], G2[0], t), lerp(G1[1], G2[1], t), lerp(G1[2], G2[2], t)]; }

/** Star polygon points: 6-point star, top vertex up. */
function starPoints(cx, cy, outer, inner) {
  const n = 6;
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / n;
    const r = (i % 2 === 0) ? outer : inner;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

/** Even-odd point-in-polygon test. */
function inside(pts, x, y) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    const intersect = ((yi > y) !== (yj > y)) &&
                      (x < (xj - xi) * (y - yi) / (yj - yi + 1e-9) + xi);
    if (intersect) c = !c;
  }
  return c;
}

/** Distance from point to nearest polygon edge segment. */
function edgeDist(pts, x, y) {
  let min = Infinity;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    const dx = xj - xi, dy = yj - yi;
    const t = Math.max(0, Math.min(1, ((x - xi) * dx + (y - yi) * dy) / (dx*dx + dy*dy + 1e-9)));
    const px = xi + t * dx, py = yi + t * dy;
    const d = Math.hypot(x - px, y - py);
    if (d < min) min = d;
  }
  return min;
}

function blend(dst, src, alpha) {
  // dst, src are [r,g,b]; alpha is 0..1; returns rgb
  return [
    Math.round(dst[0] * (1 - alpha) + src[0] * alpha),
    Math.round(dst[1] * (1 - alpha) + src[1] * alpha),
    Math.round(dst[2] * (1 - alpha) + src[2] * alpha),
  ];
}

function renderIcon(size) {
  const png = new PNG({ width: size, height: size });
  const cx = size / 2, cy = size / 2;
  const cornerR = Math.round(size * 0.22);   // rounded-square corner radius
  const outer = size * 0.36;                  // star outer radius
  const inner = outer * 0.45;                 // star inner radius
  const strokeW = Math.max(1, size * 0.012);  // white outline
  const pts = starPoints(cx, cy, outer, inner);

  // Pre-compute rounded-square mask
  const inRoundedSquare = (x, y) => {
    // The icon "tile" is a rounded square inset by 0 (full bleed). Apple
    // applies its own corner mask on iOS but we still want a tile that looks
    // good outside the iOS context (e.g. Android, Pages browser preview).
    const px = x, py = y;
    const w = size, h = size;
    if (px >= cornerR && px <= w - cornerR) return py >= 0 && py <= h;
    if (py >= cornerR && py <= h - cornerR) return px >= 0 && px <= w;
    // Corner zones — check distance to nearest corner center
    let ccx, ccy;
    if (px < cornerR && py < cornerR) { ccx = cornerR; ccy = cornerR; }
    else if (px > w - cornerR && py < cornerR) { ccx = w - cornerR; ccy = cornerR; }
    else if (px < cornerR && py > h - cornerR) { ccx = cornerR; ccy = h - cornerR; }
    else { ccx = w - cornerR; ccy = h - cornerR; }
    return Math.hypot(px - ccx, py - ccy) <= cornerR;
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (size * y + x) << 2;

      // Outside the rounded tile = fully transparent so iOS / Android can
      // mask it cleanly with their own shape.
      if (!inRoundedSquare(x, y)) {
        png.data[idx] = 0; png.data[idx+1] = 0; png.data[idx+2] = 0; png.data[idx+3] = 0;
        continue;
      }

      // Background fill
      let r = BG[0], g = BG[1], b = BG[2];

      // Star fill: diagonal gradient pink → cyan
      const ed = edgeDist(pts, x, y);
      const insideStar = inside(pts, x, y);
      if (insideStar) {
        // Gradient param: project (x,y) onto the (135°) gradient axis
        const t = Math.max(0, Math.min(1, ((x / size) + (y / size)) / 2));
        const grad = gradient(t);
        // Anti-alias inside edge — fade fill 1px from boundary
        let aa = 1;
        if (ed < 1.0) aa = ed; // hits when boundary cuts through this pixel
        [r, g, b] = blend([r, g, b], grad, aa);
      } else if (ed < 1.0) {
        // Pixel just outside the polygon — partial fill (AA)
        const t = Math.max(0, Math.min(1, ((x / size) + (y / size)) / 2));
        const grad = gradient(t);
        [r, g, b] = blend([r, g, b], grad, 1 - ed);
      }

      // White stroke ring on the polygon edge (subtle, gives crisp pop)
      if (ed <= strokeW) {
        const aa = strokeW <= 1 ? 1 : Math.max(0, Math.min(1, strokeW - ed + 1));
        [r, g, b] = blend([r, g, b], STROKE.slice(0, 3), aa * 0.55);
      }

      png.data[idx] = r;
      png.data[idx+1] = g;
      png.data[idx+2] = b;
      png.data[idx+3] = 0xff;
    }
  }

  return PNG.sync.write(png);
}

for (const size of [180, 192, 512]) {
  const buf = renderIcon(size);
  const path = join(outDir, `icon-${size}.png`);
  writeFileSync(path, buf);
  console.log(`wrote ${path} (${buf.length} bytes)`);
}
