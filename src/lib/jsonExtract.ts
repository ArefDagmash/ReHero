// LLMs reliably wrap JSON in prose/code fences even when told not to (see
// docs/graph-mode-json-display-issue.md) — search for the array rather than
// assuming the whole response is clean JSON. Shared by paperClassifier.ts
// and queryRewriter.ts.
export function extractJsonArray(text: string): unknown[] | null {
  try {
    const parsed = JSON.parse(text.trim());
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // fall through to the bracket scan below
  }

  const start = text.indexOf("[");
  if (start === -1) return null;

  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "[") depth++;
    else if (text[i] === "]") {
      depth--;
      if (depth === 0) {
        try {
          const parsed = JSON.parse(text.slice(start, i + 1));
          return Array.isArray(parsed) ? parsed : null;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}
