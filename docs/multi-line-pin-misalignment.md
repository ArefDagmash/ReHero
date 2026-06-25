# Multi-Line Pin Misalignment

## Symptom

When a pinned doodle spans a single line of text, the pin marker aligns with the doodle underline. When a pinned doodle spans multiple lines of text, the pin marker appears far above the doodle — often 6-7 lines higher — despite using the same coordinate math for both cases.

## Reproduction

1. Open a PDF in the reader
2. Select a single word or phrase on one line → press "Pin" → pin marker sits on the underline
3. Select text spanning 2+ lines → press "Pin" → pin marker renders much higher than the underline

## In the code

### Pin marker position
The pin marker is a CSS-positioned `<button>` inside `pageRef` (`position: relative`). Its position is computed from the first stored rect of the pinned doodle:

```tsx
// src/components/Reader.tsx
const scale = d.zoom > 0 ? zoom / d.zoom : 1;
const first = d.rects[0];
const fy = first.y * scale;
const fh = first.h * scale;

<button style={{
  top: fy + fh - 15,   // center the 28px button on the underline (r.y + r.h - 1)
  left: 4,
  width: 28,
  height: 28,
}}>
```

### Underline position
The rough.js SVG overlay draws underlines at the same scaled coordinates:

```ts
// src/components/Reader.tsx
const r = { x: r_raw.x * scale, y: r_raw.y * scale, w: r_raw.w * scale, h: r_raw.h * scale };
drawLine(r.y + r.h - 1, seed);  // underline at bottom of rect, minus 1px
```

### Source of rects
Rects are captured via `Range.getClientRects()` and converted to pageRef-relative coordinates:

```ts
// src/components/Reader.tsx — updateDoodles()
const pageRect = page.getBoundingClientRect();
const merged = rects.map((r) => ({
  x: r.x - pageRect.x,
  y: r.y - pageRect.y,
  w: r.width,
  h: r.height,
}));
```

They are then merged by horizontal proximity (midpoint Y difference < 5px) to collapse same-line rects into one per visual line.

## What's known

- The same coordinates feed both the rough.js underlines and the pin marker position
- The pin marker and the rough.js line share an identical Y calculation: `y * scale + h * scale`
- The pin marker subtracts 15px to center the 28px-tall button on the underline (underline Y - 14 - 1)
- For single-line highlights, this produces exact alignment
- For multi-line highlights, the marker appears 6-7 lines too high
- The SVG viewport dimensions (`skeletonDimensions`) were initially mismatched with CSS coordinates, but that issue was addressed (explicit `width`/`height` attributes, zoom scaling, `skeletonDimensions` in effect deps)

## Fix Applied

The pin marker now anchors to the **last valid rect** (the last rect with `h > 0`) instead of `d.rects[0]`:

```ts
// src/components/Reader.tsx
const validRects = d.rects.filter((r) => r.h > 0);
const anchor = validRects[validRects.length - 1];
if (!anchor) return null;
const fy = anchor.y * scale;
const fh = anchor.h * scale;
```

This skips zero-height rects (from unrendered lines, selection handles, etc.) and positions the pin at the end of the highlighted region rather than the beginning. Multi-line and single-line pins share the same math — the difference was only which rect they anchored to.

Dead code removed: an empty `for (const d of pinned)` loop leftover from an incomplete SVG-pin refactor.

## Key files

- `src/components/Reader.tsx` — pin marker rendering (line 687-689), rough.js effect, `updateDoodles`
- `src/store/useAppStore.ts` — `PinnedDoodle` type, `currentDoodleRects`, `pinnedDoodles`
- `src/components/HighlightMenu.tsx` — `handlePin`, `handleNoteSave` (captures coordinates at pin time)
