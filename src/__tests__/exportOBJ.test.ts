import { describe, it, expect } from 'vitest';
import { generateOBJ } from '../utils/export/exportOBJ';
import type { PatternPiece } from '../types/types';

function makePiece(name: string, outline: any[]): PatternPiece {
  return {
    id: name, name, outline,
    internals: [], position: { x: 0, y: 0 }, rotation: 0,
    mirrored: false, seamAllowance: 0, createdAt: Date.now(), updatedAt: Date.now(),
  };
}

describe('OBJ Export', () => {
  it('single square → valid OBJ with vertices and faces', () => {
    const piece = makePiece('Square', [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 100] },
      { type: 'L', values: [0, 100] },
      { type: 'Z', values: [] },
    ]);
    const obj = generateOBJ([piece]);
    expect(obj).toContain('o Square');
    const vLines = obj.split('\n').filter(l => l.startsWith('v '));
    const fLines = obj.split('\n').filter(l => l.startsWith('f '));
    expect(vLines.length).toBe(4);
    expect(fLines.length).toBe(2);
  });

  it('triangle → 1 face (3 vertices)', () => {
    const piece = makePiece('Tri', [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [50, 100] },
      { type: 'Z', values: [] },
    ]);
    const obj = generateOBJ([piece]);
    const fLines = obj.split('\n').filter(l => l.startsWith('f '));
    expect(fLines.length).toBe(1);
  });

  it('multiple pieces → multiple o sections', () => {
    const p1 = makePiece('Front', [
      { type: 'M', values: [0, 0] }, { type: 'L', values: [10, 0] },
      { type: 'L', values: [10, 10] }, { type: 'Z', values: [] },
    ]);
    const p2 = makePiece('Back', [
      { type: 'M', values: [0, 0] }, { type: 'L', values: [20, 0] },
      { type: 'L', values: [20, 20] }, { type: 'Z', values: [] },
    ]);
    const obj = generateOBJ([p1, p2]);
    expect(obj).toContain('o Front');
    expect(obj).toContain('o Back');
  });

  it('OBJ header present', () => {
    const obj = generateOBJ([]);
    expect(obj).toContain('# OpenClo OBJ Export');
  });

  it('all faces are triangles (3 vertices each)', () => {
    const piece = makePiece('Penta', [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [120, 80] },
      { type: 'L', values: [50, 120] },
      { type: 'L', values: [-20, 80] },
      { type: 'Z', values: [] },
    ]);
    const obj = generateOBJ([piece]);
    const fLines = obj.split('\n').filter(l => l.startsWith('f '));
    for (const f of fLines) {
      const parts = f.trim().split(/\s+/);
      expect(parts.length).toBe(4); // 'f' + 3 indices
    }
  });

  it('vertex count matches flattened points', () => {
    const piece = makePiece('Quad', [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [50, 0] },
      { type: 'L', values: [50, 50] },
      { type: 'L', values: [0, 50] },
      { type: 'Z', values: [] },
    ]);
    const obj = generateOBJ([piece]);
    const vLines = obj.split('\n').filter(l => l.startsWith('v '));
    expect(vLines.length).toBe(4);
  });
});
