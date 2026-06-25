# Text Selection Gap Bug

## Problem

When selecting text across multiple lines in the PDF viewer, dragging the mouse through the empty space between lines caused the browser to select **all text on the entire page**. Once the mouse reached the next line, the selection snapped back to normal.

This happened consistently in the few pixels of vertical gap between any two lines of PDF text.

## Root Cause

PDF.js renders a text layer using absolutely positioned `<span>` elements — one per word or character. The spans are laid out by PDF.js with exact coordinates matching the original PDF text positions. Gaps between lines contain no DOM nodes.

The browser's native `Selection` and `Range` APIs, when extending a selection through empty space, pick up the nearest text nodes in the DOM tree. Since all text spans are siblings inside the `.pdf-text-layer` container, the range extension spans from the origin span all the way to whatever span is nearest to the cursor — which often means the entire line width (or worse, the entire page).

In other words: the browser can't see the "lines" — it only sees sibling spans in a flat container. The gap between visual lines is invisible to the selection algorithm.

## Fix

Two-line CSS change in `src/index.css`:

```css
.pdf-text-layer {
  user-select: none;   /* container is not selectable */
}

.pdf-text-layer span {
  user-select: text;   /* only individual spans are selectable */
}
```

**Before**: both container and spans had default `user-select` (auto), meaning the browser was free to extend selections through the container's empty regions.

**After**: the container explicitly opts out of selection. Only the text spans themselves are selectable. The browser's range extension cannot jump through non-selectable DOM regions, so the gap between lines is no longer a valid selection path.

This constrains the native selection range to follow only the actual text nodes, matching the visual line boundaries.
