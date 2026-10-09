// Central display-scaling math shared by the canvas, HUD and crosshair.
export type FitMode = "stretch" | "blackbars" | "cover" | "native";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Accepts any positive finite number that is still precisely representable. */
export function parseDimension(input: unknown): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "string" && input.trim() === "") return null;
  const n = typeof input === "number" ? input : Number(input);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n > Number.MAX_SAFE_INTEGER) return null;
  return n;
}

/** Parses "W:H" into a ratio, rejecting invalid parts. */
export function parseAspect(aspect: string): { w: number; h: number; ratio: number } | null {
  const m = /^\s*([^:]+):([^:]+)\s*$/.exec(aspect ?? "");
  if (!m) return null;
  const w = parseDimension(m[1]);
  const h = parseDimension(m[2]);
  if (w === null || h === null) return null;
  const ratio = w / h;
  if (!Number.isFinite(ratio) || ratio <= 0) return null;
  return { w, h, ratio };
}

/**
 * Computes the on-screen rectangle (CSS px, relative to the container) where the
 * game image is shown. Canvas, HUD and crosshair all render inside this rect.
 * - stretch: fill the container (image is distorted to the chosen aspect)
 * - blackbars: largest rect of the target aspect that fits (letter/pillarbox)
 * - cover: smallest rect of the target aspect that covers (cropped)
 * - native: fill the container, rendering at native pixels
 */
export function computeStageRect(containerW: number, containerH: number, aspect: number, fit: FitMode): Rect {
  const cw = Math.max(0, containerW);
  const ch = Math.max(0, containerH);
  if (fit === "stretch" || fit === "native" || cw === 0 || ch === 0 || !(aspect > 0)) {
    return { x: 0, y: 0, w: cw, h: ch };
  }
  const containerAspect = cw / ch;
  let w: number;
  let h: number;
  const wider = containerAspect > aspect;
  if (fit === "blackbars" ? wider : !wider) {
    h = ch;
    w = ch * aspect;
  } else {
    w = cw;
    h = cw / aspect;
  }
  return { x: (cw - w) / 2, y: (ch - h) / 2, w, h };
}

/** Internal render size requested for the current settings. */
export function requestedRenderSize(
  fit: FitMode,
  resolution: { w: number; h: number } | null,
  stage: Rect,
): { w: number; h: number } {
  if (fit === "native" || !resolution) return { w: Math.max(1, Math.round(stage.w)), h: Math.max(1, Math.round(stage.h)) };
  return { w: Math.max(1, Math.round(resolution.w)), h: Math.max(1, Math.round(resolution.h)) };
}

/** Quality caps device pixel ratio to keep low-end devices (Chromebooks) fast. */
export function pixelRatioFor(quality: "low" | "medium" | "high", devicePixelRatio: number, nativeFit: boolean) {
  const cap = quality === "low" ? 0.75 : quality === "medium" ? 1 : 1.25;
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  return nativeFit ? Math.min(dpr, cap) : Math.min(1, cap);
}

/** Codes the game owns; only these get preventDefault while playing. */
export const GAME_CODES = new Set([
  "KeyW", "KeyA", "KeyS", "KeyD", "ShiftLeft", "ControlLeft", "Space",
  "KeyT", "KeyC", "KeyV", "Digit1", "Digit2", "KeyR", "KeyE", "KeyQ",
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
]);

/** True when a key event should be prevented (game key, no browser shortcut chord). */
export function shouldPreventKey(e: { code: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean }) {
  if (!GAME_CODES.has(e.code)) return false;
  if (e.metaKey || e.altKey) return false;
  // Ctrl+<key> combos (Ctrl+L, Ctrl+W...) stay with the browser; Ctrl alone is crouch.
  if (e.ctrlKey && e.code !== "ControlLeft") return false;
  return true;
}
