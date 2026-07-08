// ponytail: shared ref so HighlightMenu can push text into the Excalidraw canvas
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

let _api: ExcalidrawImperativeAPI | null = null;

export function setExcalidrawApi(api: ExcalidrawImperativeAPI | null) {
  _api = api;
}

export function getExcalidrawApi() {
  return _api;
}

// ponytail: rough text measurement for Excalidraw Virgil font (fontFamily 1)
function measureText(text: string, fontSize: number) {
  const avgChar = fontSize * 0.65; // Virgil is wider than monospace, add margin
  const maxW = 380;
  const rawW = text.length * avgChar;
  const width = Math.min(rawW, maxW);
  const charsPerLine = Math.floor(width / avgChar) || 1;
  const lines = Math.ceil(text.length / charsPerLine);
  const lineH = fontSize * 1.3;
  const height = Math.max(lineH, lines * lineH);
  return { width, height, lines };
}

export function pushTextToCanvas(text: string) {
  const api = _api;
  if (!api) return false;
  const existing = api.getSceneElements();
  const state = api.getAppState();
  const x = -state.scrollX + state.width / 2;
  const y = -state.scrollY + state.height / 2;
  const stagger = 30 * existing.filter((e) => Math.abs(e.x - x) < 300 && Math.abs(e.y - y) < 300).length;
  const clean = text.trim();
  const ts = `${Date.now()}`;
  const rseed = Math.floor(Math.random() * 2 ** 31);

  const fontSize = 14;
  const { width: tw, height: th } = measureText(clean, fontSize);
  const id = `t${ts}`;

  const newText = {
    id,
    type: "text" as const,
    x: x - tw / 2 + stagger,
    y: y - th / 2 + stagger,
    width: Math.max(50, Math.round(tw)),
    height: Math.max(20, Math.round(th)),
    text: clean,
    originalText: clean,
    fontSize,
    fontFamily: 5, // code/monospace font
    textAlign: "left" as const,
    verticalAlign: "top" as const,
    autoResize: true,
    lineHeight: 1.25 as any,
    strokeColor: "#1e1e1e",
    backgroundColor: "transparent",
    fillStyle: "solid" as const,
    strokeWidth: 0,
    strokeStyle: "solid" as const,
    roughness: 0,
    opacity: 100,
    angle: 0,
    seed: rseed,
    version: 1,
    versionNonce: 0,
    index: null as string | null,
    isDeleted: false,
    groupIds: [] as readonly string[],
    frameId: null as string | null,
    boundElements: null as any,
    containerId: null,
    updated: Date.now(),
    link: null as string | null,
    locked: false,
    roundness: null as any,
  };
  api.updateScene({
    elements: [...existing, newText as any],
    commitToHistory: true,
  });
  api.refresh();
  setTimeout(() => api.scrollToContent(), 50);
  return true;
}
