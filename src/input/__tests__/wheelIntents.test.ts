import { describe, it, expect } from 'vitest';
import { wheelIntent, zoomFactor, ZOOM_K } from '../wheelIntents';

const plain = { ctrlKey: false, metaKey: false };
const pinch = { ctrlKey: true, metaKey: false };

describe('wheelIntent — matrix scheme × surface × modifiers', () => {
  it('mouse + 3d + plain wheel = zoom', () => {
    expect(wheelIntent({ deltaX: 0, deltaY: 100, ...plain }, 'mouse', '3d'))
      .toEqual({ kind: 'zoom', delta: 10 }); // clamped ±10
  });

  it('trackpad + 3d + plain wheel = orbit (clamped deltas)', () => {
    expect(wheelIntent({ deltaX: 30, deltaY: -4, ...plain }, 'trackpad', '3d'))
      .toEqual({ kind: 'orbit', dx: 10, dy: -4 });
  });

  it('pinch (ctrlKey) = zoom on BOTH schemes and BOTH surfaces', () => {
    for (const scheme of ['mouse', 'trackpad'] as const) {
      for (const surface of ['2d', '3d'] as const) {
        expect(wheelIntent({ deltaX: 0, deltaY: -3, ...pinch }, scheme, surface))
          .toEqual({ kind: 'zoom', delta: -3 });
      }
    }
  });

  it('metaKey wheel also means zoom (⌘+wheel)', () => {
    expect(wheelIntent({ deltaX: 0, deltaY: 5, ctrlKey: false, metaKey: true }, 'trackpad', '2d'))
      .toEqual({ kind: 'zoom', delta: 5 });
  });

  it('mouse + 2d + plain wheel = zoom (today\'s behavior untouched)', () => {
    expect(wheelIntent({ deltaX: 0, deltaY: -100, ...plain }, 'mouse', '2d'))
      .toEqual({ kind: 'zoom', delta: -10 });
  });

  it('trackpad + 2d + plain wheel = pan with RAW pixel deltas (sanity-clamped ±200)', () => {
    expect(wheelIntent({ deltaX: 12.5, deltaY: -48, ...plain }, 'trackpad', '2d'))
      .toEqual({ kind: 'pan', dx: 12.5, dy: -48 });
    expect(wheelIntent({ deltaX: 9999, deltaY: 0, ...plain }, 'trackpad', '2d'))
      .toEqual({ kind: 'pan', dx: 200, dy: 0 });
  });

  it('returns null on zero or non-finite deltas (NaN guard per spec error handling)', () => {
    expect(wheelIntent({ deltaX: 0, deltaY: 0, ...plain }, 'mouse', '2d')).toBeNull();
    expect(wheelIntent({ deltaX: NaN, deltaY: Infinity, ...plain }, 'trackpad', '3d')).toBeNull();
  });
});

describe('zoomFactor — clamped exponential 2^(-Δ·k)', () => {
  it('one mouse notch (deltaY 100 → clamp 10) ≈ today\'s 0.9 step', () => {
    expect(zoomFactor(100)).toBeCloseTo(Math.pow(2, -10 * ZOOM_K), 10);
    expect(zoomFactor(100)).toBeGreaterThan(0.89);
    expect(zoomFactor(100)).toBeLessThan(0.92);
  });

  it('is symmetric: zoomFactor(d) * zoomFactor(-d) === 1', () => {
    expect(zoomFactor(7) * zoomFactor(-7)).toBeCloseTo(1, 10);
  });

  it('non-finite delta → factor 1 (no-op)', () => {
    expect(zoomFactor(NaN)).toBe(1);
  });
});
