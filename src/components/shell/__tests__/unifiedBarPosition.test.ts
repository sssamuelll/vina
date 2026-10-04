/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { loadPosition, clampPosition } from '../barPosition';

function setViewport(w: number, h: number) {
  Object.defineProperty(window, 'innerWidth', { value: w, writable: true, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: h, writable: true, configurable: true });
}

const KEY = 'vina-bar-position';

describe('loadPosition — restoring a persisted bar position', () => {
  beforeEach(() => localStorage.clear());

  it('clamps a position saved on a bigger window into the current viewport', () => {
    // Saved while maximized (1600x900), reopened at 800x500 — the bug that
    // left the bar fully outside the viewport (repro 2026-06-04).
    localStorage.setItem(KEY, JSON.stringify({ x: 1020, y: 820 }));
    setViewport(800, 500);
    const p = loadPosition();
    expect(p.x + 560).toBeLessThanOrEqual(800); // BAR_WIDTH inside
    expect(p.y + 48).toBeLessThanOrEqual(500);  // BAR_HEIGHT inside
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.y).toBeGreaterThanOrEqual(0);
  });

  // A 1600 px la línea al pie mide clamp(36px, 2,5vw, 48px) = 40.
  it('falls back to bottom-center on corrupt JSON', () => {
    localStorage.setItem(KEY, '{not json');
    setViewport(1600, 900);
    const p = loadPosition();
    expect(p).toEqual({ x: Math.round((1600 - 560) / 2), y: 900 - 40 - 48 - 24 });
  });

  it('falls back to bottom-center on non-finite coordinates', () => {
    localStorage.setItem(KEY, JSON.stringify({ x: 'wat', y: null }));
    setViewport(1600, 900);
    const p = loadPosition();
    expect(p).toEqual({ x: Math.round((1600 - 560) / 2), y: 900 - 40 - 48 - 24 });
  });
});

describe('clampPosition — bar movable everywhere except over the top-bar', () => {
  it('allows the whole viewport below the top-bar', () => {
    setViewport(1600, 900);
    const mid = clampPosition(700, 400); // middle of the screen — now legal
    expect(mid).toEqual({ x: 700, y: 400 });
  });

  it('never overlaps the top-bar (measured from the live .top-bar element)', () => {
    setViewport(1600, 900);
    const topBar = document.createElement('div');
    topBar.className = 'top-bar';
    topBar.getBoundingClientRect = () => ({ bottom: 44, top: 0, left: 0, right: 1600, width: 1600, height: 44, x: 0, y: 0, toJSON: () => ({}) });
    document.body.appendChild(topBar);
    try {
      const p = clampPosition(700, -200);
      expect(p.y).toBe(44 + 8); // top-bar bottom + margin
    } finally {
      topBar.remove();
    }
  });

  it('falls back to the token max (48px) when no top-bar is mounted', () => {
    setViewport(1600, 900);
    const p = clampPosition(700, -200);
    expect(p.y).toBe(48 + 8);
  });

  it('still clamps right/bottom edges', () => {
    setViewport(1600, 900);
    const p = clampPosition(5000, 5000);
    expect(p.x).toBe(1600 - 560 - 16);
    expect(p.y).toBe(900 - 40 - 48 - 16);
  });
});

describe('la barra no tapa la línea al pie (spec 2026-10-02 § 5.3)', () => {
  it('con la línea montada, no baja de su borde de arriba', () => {
    setViewport(1366, 643);
    localStorage.clear();
    const linea = document.createElement('div');
    linea.className = 'linea-al-pie';
    linea.getBoundingClientRect = () => ({ top: 607, bottom: 643, left: 0, right: 1366, width: 1366, height: 36, x: 0, y: 607, toJSON: () => ({}) });
    document.body.appendChild(linea);
    try {
      expect(clampPosition(400, 9999).y).toBe(607 - 48 - 16);
      expect(loadPosition().y).toBe(607 - 48 - 24);
    } finally {
      linea.remove();
    }
  });

  it('sin la línea montada (el primer render) la calcula como --top-bar-h: una posición guardada antes de P2b no queda debajo', () => {
    setViewport(1366, 643);
    localStorage.setItem(KEY, JSON.stringify({ x: 400, y: 643 - 58 - 24 }));
    expect(loadPosition().y).toBe(643 - 36 - 48 - 16);
  });
});
