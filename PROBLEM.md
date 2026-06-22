# PDF Text Layer Alignment Problem

## Current Issue

The text layer (invisible selectable text overlay) in the PDF viewer is **misaligned** with the actual PDF content. When users try to select text, the clickable/selectable area does not match the visual text position on the page.

### Symptoms
- PDF renders correctly and is readable
- Text selection works but highlights the **wrong text** or in the **wrong position**
- The text layer appears to be offset/shifted relative to the actual PDF content
- Selection feels like an "attachment on top" rather than part of the content

### Visual Problem
- User can see PDF text clearly
- When clicking on text to select it, the selection doesn't align with what's visible
- Text layer is rendering but positioned incorrectly

## Expected Behavior

When a user:
1. Opens a PDF
2. Clicks on/selects text
3. The highlighted text should **exactly match** the visual text on the page

## What's Been Tried

### Attempt 1: Fixed viewport scaling
- **Issue**: Canvas and text layer were using different viewport scales
  - Text layer: `getViewport({ scale: zoom })`
  - Canvas: `getViewport({ scale: zoom * pixelRatio })`
- **Fix applied**: Made both use same viewport `scale: zoom`, scaled canvas context by pixelRatio
- **Result**: Still misaligned ❌

### Attempt 2: Dynamic skeleton sizing & container scrolling
- **Issue**: Cropping on zoom, layout shifts, no scrolling
- **Fix applied**: Made container `overflow-auto`, dynamic skeleton sizing
- **Result**: Fixed zooming/scrolling, didn't fix text layer alignment ❌

### Attempt 3: Text layer positioning & z-index
- **Issue**: Text layer might be rendering below canvas
- **Fix applied**: Added explicit `position: absolute; top: 0; left: 0; z-index: 10` inline styles
- **Result**: Text layer now visible but still misaligned ❌

### Attempt 4: Removed Math.floor() rounding
- **Issue**: Rounding viewport dimensions might cause pixel-level misalignment
- **Fix applied**: Use exact viewport.width/height without Math.floor()
- **Result**: Still misaligned ❌

## Code Architecture

**Current implementation** (`Reader.tsx`):
```jsx
<div className="relative inline-block" style={{ width: cssW, height: cssH }}>
  <canvas ref={canvasRef} className="block" />
  <div ref={textLayerRef} className="pdf-text-layer" />
</div>
```

**Canvas rendering**:
- Viewport: `scale: zoom`
- Canvas internal size: `Math.round(cssW * pixelRatio) × Math.round(cssH * pixelRatio)`
- Canvas CSS size: `cssW × cssH`
- Context scaled: `ctx.scale(pixelRatio, pixelRatio)`

**Text layer rendering**:
- Same viewport: `scale: zoom`
- Container size: `cssW × cssH` (via inline styles)
- PDF.js TextLayer creates `.textLayer` div with positioned spans inside

## Possible Root Causes

1. **Viewport dimension mismatch** — rounding/precision loss in calculations
2. **PDF.js TextLayer internal positioning** — spans positioned incorrectly by PDF.js
3. **Context transformation issue** — canvas context scaling not applied correctly
4. **Container positioning** — parent div or text layer div positioning causing offset
5. **Browser pixel ratio handling** — devicePixelRatio calculations wrong
6. **PDF metadata** — specific PDFs rendering differently

## Next Steps to Try

1. **Debug the actual offset** — measure pixel difference between canvas and text layer
2. **Use react-pdf wrapper** — library that handles text layer alignment automatically
3. **Try PSPDFKit or similar** — battle-tested commercial solution
4. **Check PDF.js examples** — find working implementation and compare line-by-line
5. **Simplify to 1:1 scale** — test with zoom = 1.0 to eliminate scaling variables
6. **Test with different PDFs** — see if issue is PDF-specific

## Related Files

- `src/components/Reader.tsx` — main PDF rendering component
- `src/index.css` — text layer styling (`.pdf-text-layer`)
- `README.md` — architecture & feature documentation

## Dev Server

Currently running on `localhost:1420` (Vite dev server).

To restart: `npm run dev`
