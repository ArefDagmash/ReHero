# Graph Mode: JSON Appears in Chat Instead of Mermaid

## Expected Behavior

For Graph mode, the model outputs a JSON object describing nodes and edges. The app converts this JSON to a Mermaid code block internally and displays the Mermaid (with Sketch/Copy buttons) to the user. The raw JSON should never be visible.

## Actual Behavior

The raw JSON output from the model appears in the ClarifyPanel chat area. The Mermaid code block never renders.

## Architecture

The graph mode pipeline has three stages:

```
Stream chunks → accumulate in ref → extract JSON → generate Mermaid → display
```

### Stage 1: Streaming (ClarifyPanel.tsx)

The LLM response streams chunk-by-chunk into `fullTextRef`. A typewriter interval (every 8ms) reads `fullTextRef.current` and types it character-by-character into `displayText` state via a React functional state update:

```
Typewriter tick:
  full = fullTextRef.current       // capture ref synchronously
  setDisplayText(prev => {
    if (prev.length >= full.length) return prev   // guard: don't shrink
    return full.slice(0, prev.length + 3)         // type 3 more chars
  })
```

### Stage 2: Extraction (after stream ends)

`extractJson()` searches the accumulated text for a JSON object with `"nodes"` and `"edges"` keys. If found, it returns a typed `GraphJson` object.

### Stage 3: Conversion

`jsonToMermaid()` generates a valid `graph TD` string from the structured data. Labels are sanitized (parens, braces, `$` stripped). The result is wrapped in ` ```mermaid ` fences and set as the display text.

## Root Cause: Ref-State Ordering

The typewriter and the graph processing logic share a mutable ref (`fullTextRef`) and React state (`displayText`). The ordering of operations creates a race condition.

### The broken sequence (original code)

```
1. fullTextRef.current = result.text     // ref = raw JSON string
2. Typewriter tick: full = JSON, prev = JSON → types more JSON
3. setDisplayText("")                    // queue: empty display
4. Typewriter tick: full = JSON (ref NOT updated yet!), prev = JSON
5. fullTextRef.current = wrappedResult   // ref = Mermaid string (too late)
6. React renders: processes setDisplayText("") → displayText = ""
7. React renders (same batch): processes typewriter functional update
   → prev = "", full = JSON (ref was JSON at capture time!)
   → types JSON[0:3] into display      ← JSON reinserts itself
8. Next typewriter tick: full = Mermaid, prev = JSON
   → JSON.length >= Mermaid.length → returns JSON unchanged  ← stuck forever
```

### Key detail

The typewriter captures `fullTextRef.current` at the START of each tick, before any React state processing. If `setDisplayText("")` runs before the ref is updated, the typewriter uses the OLD ref value (JSON) during the functional update. Since `prev = ""` and `full = JSON`, it starts typing JSON again. Then `JSON.length >= Mermaid.length` ensures it never transitions away.

### Why the typewriter guard matters

The guard `if (prev.length >= full.length) return prev` exists to prevent shrinking (undoing already-typed text). But it also prevents transitioning from a longer JSON string to a shorter Mermaid string. Once the display contains JSON, the guard makes it immutable.

## Mitigations Attempted

1. `setDisplayText("")` before ref update — fails because ref is stale during typewriter tick.
2. `setDisplayText(wrappedResult)` directly — sets final content, but typewriter tick with stale JSON ref can still fire before React processes the update.
3. **Fix: set ref first, then state.** Update `fullTextRef.current` BEFORE calling `setDisplayText`. Synchronous ref change ensures the typewriter captures the correct (Mermaid) ref on its next tick.
