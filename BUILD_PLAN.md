# Polygon Stickers — build plan

## Goal

An "app" on Jack's iPhone where he designs polygon stickers (custom sides,
colors, fills, strokes) and dumps them into his iOS sticker collection
(the iMessage drawer / system-wide stickers).

Constraints, in priority order:

1. **Free** — no Apple Developer Program ($99/yr), no App Store.
2. **Adds to iPhone** — must feel like an app from the home screen.
3. **Makes stickers well** — output is high-resolution, transparent
   background, anti-aliased, lands in the sticker collection cleanly.
4. **Polygons specifically** — sides 3–50, regular/star/irregular, fill
   color or gradient, optional stroke.
5. **Distributed ghetto if needed** — Jack accepts non-App-Store paths.

## Architecture — Progressive Web App on GitHub Pages

This is the only path that hits all constraints with zero spend and zero
ongoing maintenance:

- **No native code, no Apple Dev account.** A PWA on Safari → "Add to
  Home Screen" produces a home-screen icon that opens full-screen, no
  Safari chrome. It's an "app" by every behavioral measure that matters:
  tap icon → app opens → use → done.
- **Free hosting forever.** GitHub Pages serves static HTML/JS/CSS for
  free from `jhomer192/polygon-stickers`. No deploy, no server, no cron.
- **No App Store review, no signing certs, no 7-day re-sign dance.**
  AltStore/SideStore would work but are friction Jack will hate.

### Sticker handoff to iOS

iOS 16+ lifts subjects from any image into stickers via long-press in
Photos. The flow:

1. PWA renders the polygon to a 1024×1024 PNG, transparent background.
2. Tap **Share** → `navigator.share({files: [pngBlob]})` opens the iOS
   share sheet → Save to Photos.
3. Jack opens Photos, long-presses the polygon, taps **Add Sticker**.
4. Sticker lives in the system sticker drawer; available in iMessage,
   Mail, anywhere stickers go.

We *cannot* programmatically add to the sticker collection — Apple only
exposes that via the user's long-press gesture. But the round trip is
two taps: save → long-press in Photos. Acceptable.

## Tech stack

- **Single-page vanilla JS.** No framework, no build step. One
  `index.html`, one `app.js`, one `style.css`. Under 500 LOC.
- **SVG for editing surface.** Crisp on any DPR, easy hit-testing,
  no canvas aliasing during interactive editing.
- **Canvas for export.** `<canvas>` rasterizes the final SVG to a
  1024×1024 PNG via `canvas.toBlob('image/png')`. Transparent preserved.
- **PWA manifest + service worker.** Minimal SW that caches static files
  so the app opens offline once installed. Gives iOS the "installable"
  signal it requires.
- **GitHub Pages.** Push to `main`, Pages publishes from root. ~30s
  commit-to-live.

## Feature scope — v1

The simplest version that's actually good, not the kitchen sink.

### Polygon design controls

- **Sides**: slider 3–50.
- **Mode**: regular n-gon | star (with inner/outer radius ratio).
- **Rotation**: 0–360°, tap to snap to 0/45/90/etc.
- **Fill**: solid color (HSL picker + 12 presets + black/white) OR
  linear gradient (2 stops, angle).
- **Stroke**: width 0–20px, color, optional.
- **Effects** (each toggleable, none on by default):
  - Drop shadow (soft, fixed offset)
  - Inner glow (soft, fill-matching)

### Output

- **Save / Share** — generate PNG, fire Web Share API, fallback to
  download link.
- **Copy as image** — `navigator.clipboard.write` with `ClipboardItem`.
  iOS Safari 16+ supports it; one tap into Messages → paste.

### Out of scope for v1

- Multi-polygon compositing
- Custom irregular vertex editing
- Photo backgrounds / subject overlay
- Animated stickers (APNG, totally different path)
- Cloud sync of designs
- Sticker pack export (requires Apple Dev account)

## Implementation steps

1. **Scaffold.** `index.html`, `app.js`, `style.css`,
   `manifest.webmanifest`, `service-worker.js`, `icon-512.png`,
   `icon-180.png` (iOS apple-touch-icon), `README.md`. Wire manifest +
   SW + apple-touch-icon meta tags.

2. **Polygon math + SVG renderer.** Pure function:
   `{sides, mode, rotation, starRatio}` → SVG `<path d="...">`. Regular
   n-gon: `n` vertices at `2πi/n + rotation` on unit circle. Star:
   alternating outer/inner radii at `n*2` vertices.

3. **Mobile-first layout.** Preview top half. Controls in a scrollable
   bottom sheet — big thumb-friendly sliders, no tiny inputs. Test on
   real iPhone, not Chrome dev-tools (iOS Safari has 100vh / safe-area
   quirks).

4. **Color/gradient pickers.** Build simple: hue slider + 12 presets.
   Gradient = two pickers + angle control.

5. **PNG export.** SVG → `Image` → `<canvas>` `drawImage` →
   `canvas.toBlob('image/png')`. Serialize SVG via `XMLSerializer`,
   base64 to data URL, load via `Image.src`, draw to canvas at 1024×1024.
   Preserve alpha by NOT pre-filling the canvas.

6. **Share / save.** Feature-detect
   `navigator.canShare({files: [...]})`. If yes, share sheet. Else
   `<a download>`.

7. **PWA glue.** Register service worker. Cache HTML/JS/CSS/icons/manifest.
   Network-first for HTML so updates land on next visit. Version-keyed
   cache name so old cache evicts on deploy.

8. **Test on Jack's iPhone end-to-end.** Open GitHub Pages URL in
   Safari → Share → Add to Home Screen → tap icon → design polygon →
   save → Photos → long-press → Add to Stickers. If this 8-step flow
   works without head-scratching, ship.

## Distribution

1. Push to new repo `jhomer192/polygon-stickers`.
2. Enable GitHub Pages: Settings → Pages → main branch / root.
3. URL: `https://jhomer192.github.io/polygon-stickers/`.
4. Jack opens that URL on his iPhone → Share → Add to Home Screen.

## Risks / unknowns

| Risk | Mitigation |
|---|---|
| iOS PWA quirks (100vh, safe-area, touch latency) | Test on real device early; use `100dvh`, `env(safe-area-inset-*)` |
| Web Share API doesn't expose "Add to Stickers" directly | Acceptable — save to Photos, long-press handoff is two taps |
| Clipboard image paste unsupported on older iOS | Fallback: download → Photos → long-press |
| SVG-to-canvas loses gradient quality | Render at 2× then downscale; or use canvas-native gradient |
| Service worker caches stale version | Network-first for HTML, version-keyed cache name |

## Deferred polish (post-v1)

- Save designs locally (localStorage) → quick recall
- Multi-polygon compositing
- Photo subject overlay
- Sticker pack PDF export for printing
- AltStore native build if Jack ever wants real `.stickerpack` support

## Estimate

Single sit-down session. ~400–500 LOC. The interesting code is steps 2
(polygon math), 5 (SVG→PNG with alpha), and 8 (real-device testing).
Everything else is boilerplate.
