/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { loadPosition, clampPosition } from '../barPosition';

function setViewport(w: number, h: number) {
  Object.defineProperty(window, 'innerWidth', { value: w, writable: true, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: h, writable: true, configurable: true });
}

const KEY = 'openclo-bar-position';

describe('loadPosition — restoring a persisted bar position', () => {
  beforeEach(() => localStorage.clear());

  it('clamps a position saved on a bigger window into the current viewport', () => {
    // Saved while maximized (1600x900), reopened at 800x500 — the bug that
    // left the bar fully outside the viewport (repro 2026-06-04).
    localStorage.setItem(KEY, JSON.stringify({ x: 1020, y: 820 }));
    setViewport(800, 500);
    const p = loadPosition();
    expect(p.x + 560).toBeLessThanOrEqual(800); // BAR_WIDTH inside
    expect(p.y + 58).toBeLessThanOrEqual(500);  // BAR_HEIGHT inside
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.y).toBeGreaterThanOrEqual(0);
  });

  it('falls back to bottom-center on corrupt JSON', () => {
    localStorage.setItem(KEY, '{not json');
    setViewport(1600, 900);
    const p = loadPosition();
    expect(p).toEqual({ x: Math.round((1600 - 560) / 2), y: 900 - 58 - 24 });
  });

  it('falls back to bottom-center on non-finite coordinates', () => {
    localStorage.setItem(KEY, JSON.stringify({ x: 'wat', y: null }));
    setViewport(1600, 900);
    const p = loadPosition();
    expect(p).toEqual({ x: Math.round((1600 - 560) / 2), y: 900 - 58 - 24 });
  });
});

describe('clampPosition', () => {
  it('keeps the bar inside the bottom drag zone', () => {
    setViewport(1600, 900);
    const p = clampPosition(5000, -200);
    expect(p.x).toBeLessThanOrEqual(1600 - 560 - 16);
    expect(p.y).toBeGreaterThanOrEqual(900 * 0.8);
    expect(p.y).toBeLessThanOrEqual(900 - 58 - 16);
  });
});
