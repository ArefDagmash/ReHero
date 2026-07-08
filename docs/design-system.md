# Odysseus Design System — Reusable Style Guide

A minimal, dark-first, monospace-native design language. Drop this into any project to get the same vibe. Framework-agnostic — works with raw CSS, Tailwind, or any component library.

---

## Philosophy

- **Dark by default, light as an overlay** — the inverse of most design systems
- **Single accent color** — one `--red` token drives everything (brand, buttons, links, scrollbars, focus rings)
- **`color-mix()` over `rgba()`** — always theme-aware, never hardcoded opacity
- **Bouncy, alive** — `cubic-bezier(0.34, 1.56, 0.64, 1)` is the signature curve
- **Monospace-first** — Fira Code is the primary font, self-hosted, no Google Fonts dependency
- **Minimal hierarchy** — 5 core tokens (`--bg`, `--fg`, `--panel`, `--border`, `--red`) define the entire theme

---

## 1. Core CSS Variables (Design Tokens)

Copy this `:root` block into your project. These 5 tokens are the entire theme surface:

```css
:root {
  /* ── Core palette (the only 5 you need to change for a new theme) ── */
  --bg:      #282c34;   /* Main background */
  --fg:      #9cdef2;   /* Main foreground / text */
  --panel:   #111111;   /* Card, sidebar, modal, input surfaces */
  --border:  #355a66;   /* Borders, dividers, separators */
  --red:     #e06c75;   /* Accent: buttons, links, scrollbar, focus rings */

  /* ── Derived semantic tokens (auto-calculate from core, override if needed) ── */
  --color-error:    #ff4444;
  --color-success:  #4caf50;
  --color-warning:  #f0ad4e;
  --color-muted:    #888888;
  --color-accent:   #00aaff;
  --accent-primary: var(--red);

  /* ── Select/dropdown (theme-aware) ── */
  --select-bg:              var(--bg);
  --select-fg:              var(--fg);
  --select-option-bg:       color-mix(in srgb, var(--panel) 74%, var(--bg));
  --select-option-active-bg: color-mix(in srgb, var(--red) 24%, var(--panel));

  /* ── Background effect intensity (0 = off, 1 = full) ── */
  --bg-effect-intensity: 1;

  /* ── Font ── */
  --font-family: 'Fira Code', monospace;
}
```

### Light theme override

```css
:root.light {
  --bg:      #f5f5f5;
  --fg:      #2b2b2b;
  --panel:   #ffffff;
  --border:  #bbbbbb;
  --red:     #e06c75;
}
```

---

## 2. Typography

### Fonts (self-hosted, no Google Fonts)

```css
/* Fira Code — monospace, the primary UI font */
@font-face {
  font-family: 'Fira Code';
  font-weight: 400;
  font-style: normal;
  font-display: swap;
  src: url('/fonts/FiraCode-Regular.woff2') format('woff2');
}
@font-face {
  font-family: 'Fira Code';
  font-weight: 600;
  font-style: normal;
  font-display: swap;
  src: url('/fonts/FiraCode-SemiBold.woff2') format('woff2');
}

/* Inter — used for email/document content (sans-serif fallback) */
@font-face {
  font-family: 'Inter';
  font-weight: 400;
  font-style: normal;
  font-display: swap;
  src: url('/fonts/Inter-Regular.woff2') format('woff2');
}
```

### Body

```css
body {
  font-family: var(--font-family, 'Fira Code'), monospace;
  background-color: var(--bg);
  color: var(--fg);
}
```

### Density scale

```css
:root.density-compact  { font-size: 13px; }
/* default is 16px (browser default) */
:root.density-spacious { font-size: 16px; }
```

---

## 3. Color Palette — All Built-in Themes

To build a new theme, just pick 5 colors for `--bg`, `--fg`, `--panel`, `--border`, `--red`:

| Theme | `--bg` | `--fg` | `--panel` | `--border` | `--red` |
|-------|--------|--------|-----------|------------|---------|
| dark (default) | `#282c34` | `#9cdef2` | `#111111` | `#355a66` | `#e06c75` |
| light | `#f5f5f5` | `#2b2b2b` | `#ffffff` | `#bbbbbb` | `#e06c75` |
| midnight | `#0d1117` | `#c9d1d9` | `#161b22` | `#30363d` | `#f85149` |
| cyberpunk | `#0a0a0f` | `#0ff0fc` | `#12101a` | `#9b30ff` | `#e040fb` |
| retrowave | `#1a1a2e` | `#e94560` | `#16213e` | `#533483` | `#e94560` |
| forest | `#1b2a1b` | `#a8d5a2` | `#142414` | `#3d6b3d` | `#7cb871` |
| ocean | `#0b1a2c` | `#64d2ff` | `#091422` | `#1e5074` | `#4facfe` |
| copper | `#1c1410` | `#e8c39e` | `#140f0a` | `#7a5533` | `#d4764e` |
| terminal | `#000000` | `#00ff41` | `#0a0a0a` | `#003b00` | `#00ff41` |

---

## 4. Spacing Scale

| Token/Value | Usage |
|-------------|-------|
| `4px` | Button inner padding, icon rail gap, small gaps |
| `6px` | List item gap, code block padding, rail chips |
| `8px` | **Default gap** — message margins, sidebar gaps, section header padding |
| `10px` | Sidebar inner padding, input bar horizontal |
| `12px` | Message bubble padding, search input padding |
| `16px` | Container horizontal padding, toast offset |
| `24px` | Grid/pattern background size |

### Compact overrides
```css
.density-compact .msg { padding: 6px 10px; margin-bottom: 4px; }
.density-spacious .msg { padding: 14px 18px; margin-bottom: 12px; }
```

---

## 5. Border Radius

| Value | Where |
|-------|-------|
| `4px` | Inputs, buttons, list items, scrollbar thumb |
| `6px` | Icon buttons, rail buttons, dropdown items |
| `8px` | Modal content, send button, model picker |
| `12px` | Message bubbles (base) |
| `16px` | Chat input bar |
| `18px 18px 0 18px` | User chat bubble (asymmetric, points right) |
| `18px 18px 18px 0` | AI chat bubble (asymmetric, points left) |
| `50%` | Avatars, dots, checkboxes — full circles |
| `999px` | Tags, pills, chips |

---

## 6. Border Style

All borders use `1px solid` with `color-mix()` for theme awareness:

```css
border: 1px solid color-mix(in srgb, var(--fg) 12%, transparent);
/* or */
border: 1px solid var(--border);
```

Never hardcode a border color — always go through `--border` or a `color-mix()` against `--fg`.

---

## 7. Shadow / Elevation

| Level | Value | Usage |
|-------|-------|-------|
| Subtle | `0 1px 2px rgba(0,0,0,0.25)` | Toggle thumb |
| Low | `0 2px 6px rgba(0,0,0,0.25)` | Dropdowns, chips |
| Medium | `0 4px 16px rgba(0,0,0,0.4)` | Dropdown menus |
| High | `0 8px 32px rgba(0,0,0,0.45)` | Panels, popovers |
| Modal | `0 16px 48px rgba(0,0,0,0.5)` | Search popup, toasts |

Glass/frosted variants add `inset` highlights and `backdrop-filter`:
```css
box-shadow:
  0 14px 36px rgba(0,0,0,0.5),
  inset 0 1px 0 color-mix(in srgb, var(--fg) 14%, transparent);
```

---

## 8. Animation & Motion

### Easing Curves

| Name | Curve | When |
|------|-------|------|
| **Bounce** (signature) | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Buttons, menu pop, chips, toggles |
| **Ease-out** (standard) | `cubic-bezier(0.22, 0.61, 0.36, 1)` | Layout transitions, body padding |
| **Ease-in-out** | `ease-in-out` | Pulse animations, breathing |
| **Linear** | `linear` | Spinners |

### Duration

| Duration | When |
|----------|------|
| `80ms` | Hover opacity/background |
| `150ms` | Standard state transition (color, border, opacity) |
| `200ms` | Panel enter/leave |
| `250ms` | Sidebar width, chip bounce |
| `300ms` | Message enter (fade + slide) |
| `360ms` | Domino cascade (stagger children by 40ms each) |

### Keyframe: Message Enter

```css
@keyframes msg-enter {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
.msg { animation: msg-enter 0.3s ease-out both; }
```

### Keyframe: Bounce Pop

```css
@keyframes pop-in {
  from { opacity: 0; transform: scale(0.9); }
  to   { opacity: 1; transform: scale(1); }
}
.menu { animation: pop-in 0.22s cubic-bezier(0.34, 1.56, 0.64, 1) both; }
```

---

## 9. Transparency Pattern (`color-mix` over `rgba`)

Always use `color-mix(in srgb, ...)` for transparency. It stays theme-correct across dark/light:

```css
/* ❌ Never this */
background: rgba(0, 0, 0, 0.12);

/* ✅ Always this */
background: color-mix(in srgb, var(--fg) 12%, transparent);
background: color-mix(in srgb, var(--red) 24%, var(--panel));
border: 1px solid color-mix(in srgb, var(--fg) 11%, transparent);
color: color-mix(in srgb, var(--fg) 60%, transparent);  /* muted text */
```

Common opacity stops: `8%` (subtle hover) → `12%` (highlight) → `24%` (active/selected) → `60%` (muted text).

---

## 10. Layout Architecture

```
<body>                  display: flex; height: 100dvh; overflow: hidden;
├── .sidebar            width: 240px; flex-shrink: 0; background: var(--panel);
│                       flex-direction: column; border-right: 1px solid var(--border);
├── .icon-rail          width: 48px; flex-shrink: 0;
│                       (shown when sidebar collapsed)
└── .chat-container     flex: 1; flex-direction: column; overflow: hidden;
    ├── .chat-top-bar   flex-shrink: 0; padding: 5px 0 0;
    ├── .chat-history   flex: 1; overflow-y: auto;
    │                    scrollbar-gutter: stable;
    └── .chat-input-bar max-width: 800px; margin: auto; border-radius: 16px;
```

### Modal Pattern

```css
.modal-overlay {
  position: fixed; inset: 0; z-index: 300;
  background: rgba(0,0,0,0.6);
  display: flex; align-items: center; justify-content: center;
}
.modal-content {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 16px 48px rgba(0,0,0,0.5);
  max-width: 90vw; max-height: 90vh;
  display: flex; flex-direction: column;
}
.modal-header {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  cursor: move; user-select: none;
}
.modal-body   { flex: 1; overflow-y: auto; padding: 16px; }
.modal-footer {
  padding: 12px 16px;
  border-top: 1px solid var(--border);
  display: flex; justify-content: flex-end; gap: 8px;
}
```

---

## 11. Chat Bubble Pattern

```css
.msg {
  padding: 10px 12px;
  border-radius: 12px;
  max-width: 85%;
  min-width: 80px;
  animation: msg-enter 0.3s ease-out both;
}
.msg-user {
  align-self: flex-end;
  margin-left: auto;
  border-radius: 18px 18px 0 18px;   /* asymmetric: points right */
  background: var(--user-bubble-bg, color-mix(in srgb, var(--red) 16%, transparent));
  border: 1px solid var(--bubble-border, color-mix(in srgb, var(--red) 30%, transparent));
}
.msg-ai {
  align-self: flex-start;
  margin-right: auto;
  border-radius: 18px 18px 18px 0;   /* asymmetric: points left */
  background: var(--ai-bubble-bg, var(--panel));
  border: 1px solid var(--bubble-border, var(--border));
}
```

---

## 12. Glass / Frosted Glass (Optional Overlay)

Add `body.theme-frosted` to apply glass effect to panels, modals, and sidebar:

```css
body.theme-frosted .sidebar,
body.theme-frosted .modal-content {
  background-color: color-mix(in srgb, var(--panel) 32%, transparent);
  background-image: linear-gradient(180deg,
    color-mix(in srgb, var(--fg) 14%, transparent) 0%,
    color-mix(in srgb, var(--fg) 4%, transparent) 26%,
    transparent 55%
  );
  backdrop-filter: blur(24px) saturate(170%);
  border-color: color-mix(in srgb, var(--fg) 22%, transparent);
  box-shadow:
    0 14px 36px rgba(0,0,0,0.5),
    inset 0 1px 0 color-mix(in srgb, var(--fg) 14%, transparent),
    inset 0 -1px 0 color-mix(in srgb, #000 14%, transparent);
}
```

---

## 13. Button Pattern

```css
.btn {
  padding: 6px 12px;
  border-radius: 4px;
  border: 1px solid var(--border);
  background: var(--panel);
  color: var(--fg);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: opacity 0.15s, background 0.15s;
}
.btn:hover {
  background: color-mix(in srgb, var(--fg) 8%, var(--panel));
}
.btn-primary {
  background: color-mix(in srgb, var(--red) 16%, var(--panel));
  border-color: var(--red);
  color: var(--red);
}
.btn-primary:hover {
  background: color-mix(in srgb, var(--red) 28%, var(--panel));
}
```

---

## 14. Input Pattern

```css
input, textarea, select {
  padding: 6px 8px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--fg);
  font-family: inherit;
  font-size: 12px;
  transition: border-color 0.15s;
}
input:focus, textarea:focus, select:focus {
  outline: none;
  border-color: var(--red);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--red) 25%, transparent);
}
```

---

## 15. Scrollbar

```css
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: var(--panel); }
::-webkit-scrollbar-thumb {
  background: var(--red);
  border-radius: 4px;
  border: 2px solid var(--panel);
}
::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--red) 80%, white);
}
html {
  scrollbar-color: var(--red) var(--panel);
  scrollbar-width: thin;
}
```

---

## 16. Background Pattern (Dots)

```css
body.bg-pattern-dots {
  background-image: radial-gradient(
    color-mix(in srgb, var(--fg) calc(5% * var(--bg-effect-intensity, 1)), transparent) 1px,
    transparent 1px
  );
  background-size: 20px 20px;
  background-attachment: fixed;
}
```

---

## 17. Quick Reference — CSS One-Liners

```css
/* Muted text */
color: color-mix(in srgb, var(--fg) 60%, transparent);

/* Subtle hover highlight */
background: color-mix(in srgb, var(--fg) 8%, transparent);

/* Selected/active state */
background: color-mix(in srgb, var(--red) 24%, var(--panel));

/* Subtle border */
border: 1px solid color-mix(in srgb, var(--fg) 11%, transparent);

/* Soft shadow */
box-shadow: 0 4px 16px rgba(0,0,0,0.4);

/* Bounce animation */
transition: transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
```

---

## 18. Checklist for Agents

When building UI in this style, verify:

- [ ] All colors reference `--bg`, `--fg`, `--panel`, `--border`, `--red` (never hardcoded hex)
- [ ] Transparency uses `color-mix(in srgb, ...)` (never `rgba()`)
- [ ] Border radius is `4px`–`12px` (never `0` unless intentional)
- [ ] Font is `var(--font-family, 'Fira Code'), monospace`
- [ ] Buttons/inputs are self-contained: `6px 8px` padding, `4px`–`6px` border-radius
- [ ] Hover states use `color-mix(in srgb, var(--fg) 8%, transparent)` background
- [ ] Focus rings use `box-shadow: 0 0 0 2px color-mix(in srgb, var(--red) 25%, transparent)`
- [ ] Border thickness is always `1px`
- [ ] Shadows only use `rgba(0,0,0,...)` — the only place pure black is allowed
- [ ] Animations are 150–300ms, use bounce curve for pop-ins, ease-out for layout shifts
- [ ] No Google Fonts — use the font stack or self-host
