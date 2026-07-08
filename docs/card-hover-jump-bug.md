# Homepage Card Hover Jump Bug

## Symptom

On the homepage paper grid, hovering over any single paper card caused **all**
cards in the row to visibly shift position — not just the hovered one lifting,
but its neighbors jumping too.

## Reproduction

1. Add 2+ papers so multiple cards render in one row
2. Hover over any card
3. Every other card in the row visibly nudges position at the same time

## Why it was hard to find

Pure CSS `:hover` (`hover:shadow-lg hover:-translate-y-1` on the card's own
`<button>`) is scoped to that single element by the browser — it cannot
affect siblings. Automated testing (Playwright, pixel-precise
`getBoundingClientRect()` comparisons before/during/after hovering) initially
showed **no** movement in siblings, contradicting the report.

The breakthrough came from a screen recording of the actual bug. Extracting
frames and tracking a specific card's rotated top-edge Y-coordinate
frame-by-frame showed it genuinely shifting by ~7px in exact sync with a
neighboring card's hover state — proving it was real, just not reproducible
with the test setup used so far (small test PDFs with minimal height
variance).

### Isolating the cause

Rather than keep guessing, the hover behavior was disabled in stages and
tested live in the real app:

1. Disable both the CSS hover classes and the `onMouseEnter`/`onMouseLeave`
   handlers entirely → no jump (expected, nothing reacts).
2. Re-enable **only** the CSS hover (shadow + lift), leave the `hoveredId`
   React state disabled → no jump. Confirms the CSS itself is not the cause.
3. Re-enable `onMouseEnter`/`onMouseLeave` (restores `hoveredId` state,
   which drives the bottom action-bar swap between plain "N pages" text and
   the edit/delete icon buttons) → **jump reproduced immediately.**

This isolated the cause to the `hoveredId`-driven bottom action bar, not the
visual hover styling.

## Root cause

Two compounding issues in `src/components/HomePage.tsx`:

1. **The card row had no `align-items`**, so it defaulted to the browser's
   `stretch`. Any sibling's natural height change would restretch the whole
   row.
2. **The bottom action bar used `min-h-[24px]`, not a fixed height.** This
   app runs with `html { font-size: 25px }` (`src/index.css`), so `1rem` =
   25px, not the usual 16px. The edit/delete icon buttons
   (`h-4 w-4` icon + `p-1` padding) render at `25px + 2×6.25px ≈ 37.5px` —
   well past the `24px` minimum. So swapping from the page-count text to the
   icons made the card's bottom bar (and therefore the whole card) grow by
   roughly **13px** on every hover.

That combination meant: hovering a card → its own height grows ~13px →
`align-items: stretch` restretches every sibling in the row to match →
visible jump across the whole row.

## Fix applied

```tsx
// Row container — each card sizes independently, immune to a sibling's
// height changing (src/components/HomePage.tsx)
<div className="flex flex-wrap gap-6 items-start">

// Bottom action bar — fixed height, not min-height, so swapping between
// the page-count text and the edit/delete icons never changes the
// card's rendered height at all
<div className="flex items-center justify-center h-10">
```

The `items-start` fix alone reduced the blast radius but wasn't sufficient
on its own in real-world testing (real papers with more height variance
still triggered it). The `h-10` fix removes the root cause entirely — the
action bar's height literally cannot change anymore, so there's nothing
left to propagate through any layout mechanism.

## Key files

- `src/components/HomePage.tsx` — card grid row (`~line 279`), bottom
  action bar (`~line 360`)
- `src/index.css` — `html { font-size: 25px }`, relevant because it's why
  the icon buttons needed more room than the old `24px` minimum assumed
