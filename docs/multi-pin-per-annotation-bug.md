# Multi-Pin Per Annotation Bug

## Problem

Selecting text across multiple lines and pinning it created multiple pin markers — one per line of text — instead of a single marker for the entire annotation. A 3-line highlight got 3 stacked pins at the start of each line.

## Root Cause

The pin marker creation was inside the per-rect drawing loop. Each call to `rc.line()` (one per line-box of text) also spawned a pin `<g>` element:

```ts
// Before — pin created for every rect in the loop
for (const { rect: r, seed: baseSeed, id, isPinned } of allRects) {
  // draw the rough.js line for this rect
  drawLine(r.y + r.h - 1, seed);

  // BUG: creates a pin for THIS rect — multi-line = multi-pin
  if (isPinned && id) {
    const g = createPinMarker(r.x, r.y + r.h, id);
    svg.appendChild(g);
  }
}
```

A multi-line selection produces N `rects` (one per visual line). Since `isPinned` was `true` for every rect belonging to a pinned doodle, each line got its own pin marker. Three lines → three × buttons.

Zero-height rects (from unrendered lines) stacked at `top: 0`, making some pins pile up at the top of the page.

## Fix

Separate line drawing from pin placement. Draw all lines first, then place **one pin per annotation** anchored to the **last rect** (end of the highlight):

```ts
// Step 1: draw all lines (unchanged)
for (const { rect: r, seed: baseSeed } of allRects) {
  drawLine(r.y + r.h - 1, seed);
}

// Step 2: place ONE pin per pinned doodle, at the last rect
for (const d of pinned) {
  const scale = d.zoom > 0 ? zoom / d.zoom : 1;
  const last = d.rects[d.rects.length - 1];
  if (!last || last.h <= 0) continue;  // skip zero-height (unrendered)

  const g = createPinMarker(
    -28,                        // outside canvas, left margin
    last.y * scale + last.h * scale - 10  // centered on last line
  );
  g.addEventListener("click", () => removePinnedDoodle(key, d.id));
  svg.appendChild(g);
}
```

Three changes:
1. **One loop for lines, one loop for pins** — no more N pins for N lines
2. **Anchored to last rect** — pin sits at the end of the highlight, not the start
3. **Guard `last.h <= 0`** — skips zero-height rects from unrendered lines

## Key Files

- `src/components/Reader.tsx` — `useEffect` with rough.svg rendering
- `src/store/useAppStore.ts` — `PinnedDoodle` type, `pinnedDoodles` state
