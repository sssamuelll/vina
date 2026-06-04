/**
 * Pure intent layer for wheel events (spec 2026-06-04-input-scheme-design).
 * Translates a raw WheelEvent into what the active scheme wants done on a
 * given surface. ALL scheme×surface×modifier routing lives here — components
 * only execute the returned intent.
 */

export type InputSchemeId = 'mouse' | 'trackpad';
export type WheelSurface = '2d' | '3d';

export type WheelIntent =
  | { kind: 'zoom'; delta: number }          // clamped ±10
  | { kind: 'pan'; dx: number; dy: number }   // raw px, sanity-clamped ±200
  | { kind: 'orbit'; dx: number; dy: number } // clamped ±10
  | null;

/** Tuned so a mouse notch (|deltaY|≈100 → clamp 10) ≈ today's 0.9/1.1 step:
 *  2^(-10·0.015) ≈ 0.901. Trackpad pinch deltas (0.5–5) stay smooth. */
export const ZOOM_K = 0.015;

const GESTURE_CLAMP = 10;  // zoom/orbit deltas
const PAN_CLAMP = 200;     // pan keeps real pixel deltas, insane values cut

function clamp(d: number, limit: number): number {
  if (!Number.isFinite(d)) return 0;
  return Math.max(-limit, Math.min(limit, d));
}

/** Exponential zoom factor for a wheel delta. deltaY<0 (wheel up / pinch out) → >1 (zoom in). */
export function zoomFactor(delta: number): number {
  return Math.pow(2, -clamp(delta, GESTURE_CLAMP) * ZOOM_K);
}

export function wheelIntent(
  e: { deltaX: number; deltaY: number; ctrlKey: boolean; metaKey: boolean },
  scheme: InputSchemeId,
  surface: WheelSurface,
): WheelIntent {
  const rawX = Number.isFinite(e.deltaX) ? e.deltaX : 0;
  const rawY = Number.isFinite(e.deltaY) ? e.deltaY : 0;
  if (rawX === 0 && rawY === 0) return null;

  // ctrlKey on wheel = browser-synthesized pinch (Chrome/FF/Edge); ⌘+wheel = explicit zoom.
  if (e.ctrlKey || e.metaKey) return { kind: 'zoom', delta: clamp(rawY, GESTURE_CLAMP) };

  if (scheme === 'trackpad') {
    if (surface === '3d') return { kind: 'orbit', dx: clamp(rawX, GESTURE_CLAMP), dy: clamp(rawY, GESTURE_CLAMP) };
    return { kind: 'pan', dx: clamp(rawX, PAN_CLAMP), dy: clamp(rawY, PAN_CLAMP) };
  }
  return { kind: 'zoom', delta: clamp(rawY, GESTURE_CLAMP) }; // scalar delta, clamped ±10 (spec sketch used dx/dy; intentionally scalar here)
}
