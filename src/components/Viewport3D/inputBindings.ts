import type { ViewPreset } from '../../store/cameraSlice';

/**
 * Pure input-binding decisions for the 3D viewport.
 *
 * Trackpad reality (fase 1, 2026-06-04): a MacBook trackpad has no middle
 * button, so every binding that *requires* one needs a modifier fallback.
 * Pan = middle-drag (mouse, CLO3D-style) OR Alt/Option+left-drag (trackpad).
 */

/** Should this pointerdown start a camera pan? */
export function isPanGesture(e: { button: number; altKey: boolean }): boolean {
  if (e.button === 1) return true; // middle click — mouse pan
  return e.button === 0 && e.altKey; // Alt/Option+left — trackpad fallback
}

/** Should this pointerup end an active pan? (left or middle release) */
export function isPanRelease(button: number): boolean {
  return button === 0 || button === 1;
}

// CLO3D-standard view mapping. Numpad for full keyboards, top-row digits for
// laptops without one (the ShortcutRegistry defaults already declare '2'/'8'/…).
const VIEW_BY_DIGIT: Record<string, ViewPreset> = {
  '2': 'front',
  '8': 'back',
  '4': 'right',
  '6': 'left',
  '5': 'top',
  '0': 'bottom',
  '1': 'threeQuarterRight',
  '3': 'threeQuarterLeft',
};

/**
 * Map a keydown to a camera view preset, or null.
 * Rejects any modifier: Alt+digits belong to fitmap.* (defaults.ts:101-105),
 * Ctrl/Cmd+digits are browser/app chords.
 */
export function cameraViewFromKeyEvent(e: {
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}): ViewPreset | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  const match = /^(?:Numpad|Digit)([0-9])$/.exec(e.code);
  if (!match) return null;
  return VIEW_BY_DIGIT[match[1]] ?? null;
}
