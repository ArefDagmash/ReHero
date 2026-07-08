# Mermaid Diagram Generation with Small/Local Models

## Context

ResearchReader's Graph mode sends highlighted text from a PDF to an LLM, asking it to generate a Mermaid.js diagram representing the concept. The diagram is displayed as a syntax-highlighted code block with a "Sketch" button to push it into Excalidraw.

## Observation

Small and locally-hosted models (e.g., Ollama models) frequently produce syntactically invalid Mermaid diagrams. The same prompts that produce valid output from larger cloud models (Claude, GPT-4) result in parse errors from smaller models.

## Common Syntax Errors

The following patterns have been observed across multiple Ollama model responses:

### 1. Trailing Semicolons

Lines ending with `;` — valid in some programming languages, not valid in Mermaid `graph TD` syntax:

```
A[Label] --> B;
```

### 2. Parentheses Inside Diamond Nodes

Nested `()` inside `{}` node definitions cause the parser to misinterpret the shape:

```
B{Model Comparison (Table 9)}
```

Mermaid sees the closing `)` and expects a matching `(` from a different node shape, producing:

```
Parse error on line 2:
... B{Model Comparison (Table 9)};
--------------------------------^
Expecting 'SQE', 'DOUBLECIRCLEEND', 'PE', ... got 'PS'
```

### 3. LaTeX `$` in Labels

Models sometimes output `$\sim$`, `$n$`, etc. inside node labels. Mermaid does not support LaTeX:

```
P_Ours(Parameters: $\sim$1/10000 fewer)
```

### 4. Unquoted Subgraph Names with Spaces

Subgraph labels containing spaces must be quoted, but models often emit them unquoted:

```
subgraph State-of-the-Art Methods
    ...
end
```

### 5. Too Many Semicolons (repeated errors after retry)

When the model is asked to fix a syntax error and retry, it often produces the same class of error again — particularly semicolons and parentheses in node labels.

## Model Behavior

- **Cloud models (OpenAI, Anthropic)**: Rarely produce syntax errors in Mermaid output.
- **Local/Ollama models**: Consistently produce one or more of the above errors, especially on complex prompts where the concept being diagrammed involves tables, comparisons, or numeric data in node labels.
- **Reasoning models**: Use of `reasoning_content` (thinking tokens) introduces a delay before any content streams. During reasoning, the panel remains empty with a spinner, creating a perception of hanging.
- **After retry**: Small models often fail to fully correct the original error, producing a new Mermaid diagram that still has one or more syntax issues.

## Impact

1. User sees a "Thinking..." spinner for extended periods (reasoning delay).
2. Generated diagram may fail to render in the panel or in Excalidraw.
3. Retry attempts multiply the total wait time without guaranteed success.
4. User must close and retry manually, or accept a broken diagram.
