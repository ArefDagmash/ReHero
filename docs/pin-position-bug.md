# Pin Position Bug — Unpin Marker Misalignment

## Symptom

The unpin button (a clickable marker next to pinned doodle underlines) renders far above the actual doodle line — 6-7 lines higher. The user can see the doodle clearly at one position, but the × button to remove it sits somewhere else entirely.

## The Two Coordinate Systems

Two separate coordinate systems exist inside the same container (`pageRef`), and they **do not necessarily align**:

### System A — CSS positioning

The unpin button is a `<button>` with `position: absolute` inside `pageRef` (which is `position: relative`). Its position is set via CSS `top` and `left` properties, in CSS pixels measured from the top-left of `pageRef`.

```tsx
<button
  style={{
    left: rect.x - 14,        // CSS pixels from pageRef left
    top: rect.y + rect.h + 2, // CSS pixels from pageRef top
  }}
>
```

### System B — SVG coordinate space

The doodle lines are drawn by rough.js into an `<svg>` element. The SVG is also inside `pageRef`, positioned with `position: absolute; inset: 0`. Rough.js creates path elements at specific coordinates:

```ts
rc.line(r.x, r.y + r.h - 1, r.x + r.w, r.y + r.h - 1, { ... })
```

These coordinates are in the **SVG's internal user coordinate space**, not CSS pixels.

## Why They Don't Match

An SVG element's internal coordinate space is determined by its `viewBox`, `width`, and `height` attributes. The SVG was defined without any of these:

```tsx
<svg
  ref={doodleSvgRef}
  className="absolute inset-0 pointer-events-none"
  style={{ overflow: "visible" }}
  // No viewBox. No width. No height.
/>
```

Without explicit attributes, an SVG defaults to a **300×150** internal viewport, while its CSS layout box stretches to fill `pageRef` (typically 600×800 or larger). The browser scales/transforms the SVG content to fit, breaking the 1:1 relationship between CSS pixels and SVG user units.

The visual result: a rough.js `line(100, 400, 500, 400)` renders at some transformed position in the 300×150 viewport, while a CSS button at `left: 100px; top: 400px` sits at actual CSS pixel (100, 400). The two positions diverge.

## Compounding Factor — Zoom

Pinned doodles store coordinate snapshots taken at a specific zoom level. The page container (`pageRef`) dimensions change with zoom, but the stored coordinates don't.

| Action | pageRef size | Stored coordinate | Actual visual position |
|--------|-------------|-------------------|----------------------|
| Pin at zoom 1.0 | 600×800 | x: 100, y: 400 | Correct at zoom 1.0 |
| View at zoom 1.5 | 900×1200 | x: 100, y: 400 | Wrong — page scaled, coords didn't |

The rough.js effect also did not re-run on zoom changes (`zoom` was missing from its dependency array), so lines stayed at their original pixel positions even as the canvas scaled.

## Fix Applied

1. **SVG explicit dimensions**: Sets `width`/`height` attributes on the SVG matching `skeletonDimensions`, forcing its user space to equal CSS pixels (1:1 mapping). No more 300×150 default viewport scaling.
2. **Zoom-aware pinned rects**: Each `PinnedDoodle` stores the `zoom` at pin time. On render, rects are scaled by `currentZoom / pinZoom`.
3. **Zoom in effect deps**: `zoom` added to the rough.js effect dependency array so pins redraw on zoom change.
4. **Last-valid-rect anchoring**: Pin marker CSS button is anchored to the **last** rect with `h > 0` (not `d.rects[0]`), skipping zero-height rects from unrendered lines or selection handles. Matches the fix in `multi-line-pin-misalignment.md`.

## Alternative Approaches

### Option A — Everything in SVG

Move pin markers into the SVG itself. Draw them as SVG `<circle>` or `<g>` elements (or via rough.js `rc.circle()`). Attach click handlers directly. One coordinate system for everything — no CSS/SVG sync needed.

```ts
const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
circle.setAttribute("cx", String(r.x * scale));
circle.setAttribute("cy", String(r.y * scale + r.h * scale - 1));
circle.setAttribute("r", "5");
circle.addEventListener("click", () => removePinnedDoodle(key, d.id));
svg.appendChild(circle);
```

Trade-off: harder to style (SVG elements don't use Tailwind), hover effects require JS.

### Option B — Everything in CSS/HTML

Don't use rough.js SVG for pinned doodles at all. Render pinned highlights as positioned `<div>` elements with CSS borders (or canvas-drawn underlines). Then the pin buttons are normal HTML siblings — no SVG mismatch possible.

Trade-off: loses the rough.js hand-drawn aesthetic for pinned elements.

### Option C — Canvas-based rendering

Draw both lines and pin markers onto a second `<canvas>` overlaid on the page. All coordinates are in canvas pixels.

Trade-off: no CSS interactivity, click detection requires hit-testing.

## Key Files

- `src/components/Reader.tsx` — SVG definition, rough.js effect, pin button rendering, `updateDoodles`
- `src/store/useAppStore.ts` — `PinnedDoodle` type, `currentDoodleRects`, `pinnedDoodles`
- `src/components/HighlightMenu.tsx` — `handlePin` / `handleNoteSave` (captures coordinates at pin time)
