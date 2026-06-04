import { describe, it, expect } from 'vitest';
import { zoomAtPoint } from '../zoom2d';

describe('zoomAtPoint — cursor-anchored, range-clamped (preserves today\'s 2D behavior)', () => {
  it('keeps the point under the cursor fixed', () => {
    // pattern point under cursor: (cx - pan.x) / zoom
    const before = { zoom: 1, pan: { x: 50, y: 20 } };
    const cx = 300, cy = 200;
    const px = (cx - before.pan.x) / before.zoom;
    const py = (cy - before.pan.y) / before.zoom;
    const after = zoomAtPoint(before, 1.5, cx, cy);
    expect(after.pan.x + px * after.zoom).toBeCloseTo(cx, 10);
    expect(after.pan.y + py * after.zoom).toBeCloseTo(cy, 10);
  });

  it('clamps zoom to [0.1, 10] — pan unchanged when already at the limit', () => {
    const atMax = zoomAtPoint({ zoom: 10, pan: { x: 0, y: 0 } }, 2, 100, 100);
    expect(atMax.zoom).toBe(10);
    expect(atMax.pan).toEqual({ x: 0, y: 0 });
    expect(zoomAtPoint({ zoom: 0.1, pan: { x: 5, y: 5 } }, 0.5, 0, 0).zoom).toBe(0.1);
  });
});
