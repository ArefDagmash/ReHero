# Pinned Doodle Zoom Bug

## Problem

Pinned doodles didn't scale when the user zoomed in or out. After pinning a highlight at zoom 1.0 and then zooming to 1.5, the line stayed at its original size and position while the PDF page grew around it.

## Root Cause

Pinned doodle rects are stored as pixel coordinates relative to the page container (`pageRef`). These coordinates are valid for the zoom level at which they were captured. When the user changes zoom:

1. `renderPage` re-renders the PDF canvas at the new scale
2. The `pageRef` container dimensions update to match the new zoom
3. But the pinned rects remained at their old-zoom coordinates

The rough.js rendering `useEffect` did NOT include `zoom` in its dependency array:

```ts
// Before — zoom missing from deps
}, [doodleRects, pinnedDoodles, activePaperPath, currentPage, sloppiness, doodleColor, doodleStyle, strokeCount]);
```

So when zoom changed, the effect didn't re-run, and the rough.js lines stayed at their original pixel positions.

## Fix

Two changes:

### 1. Store the zoom level at pin time

Each `PinnedDoodle` now stores the `zoom` value at the moment of pinning:

```ts
type PinnedDoodle = {
  id: string;
  note: string;
  zoom: number;   // added
  rects: DoodleRect[];
};
```

### 2. Scale rects on render

In the rough.js rendering effect, each pinned rect is scaled by `currentZoom / pinZoom`:

```ts
const scale = d.zoom > 0 ? zoomScale / d.zoom : 1;
rect: {
  x: r.x * scale,
  y: r.y * scale,
  w: r.w * scale,
  h: r.h * scale,
}
```

Pin button positions apply the same scale factor.

### 3. Add `zoom` to the effect dependency array

```ts
}, [doodleRects, pinnedDoodles, activePaperPath, currentPage, zoom, sloppiness, doodleColor, doodleStyle, strokeCount]);
```

Now the effect re-runs on every zoom change, redrawing all pinned doodles at the correct scale.
