import { describe, it, expect } from 'vitest';
import { assignUniqueBlockNames, generateDXFAAMA, generateMultiSizeDXF } from '../exportAAMA';
import type { PatternPiece } from '../../../types/types';

function makePiece(name: string): PatternPiece {
  return {
    id: `id-${name}`,
    name,
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 200] },
      { type: 'L', values: [0, 200] },
      { type: 'Z', values: [] },
    ],
    seamAllowance: 0,
    grainAngle: 0,
    position: { x: 0, y: 0 },
    rotation: 0,
    mirrored: false,
    internals: [],
    notches: [],
    layer: 1,
    sublayer: 0,
    active: true,
    createdAt: 0,
    updatedAt: 0,
  } as unknown as PatternPiece;
}

function countLines(dxf: string, token: string): number {
  const re = new RegExp(`^${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'gm');
  return (dxf.match(re) ?? []).length;
}

describe('assignUniqueBlockNames', () => {
  it('passes distinct sanitized names through unchanged', () => {
    expect(assignUniqueBlockNames(['Front', 'Back', 'Sleeve'])).toEqual([
      'Front',
      'Back',
      'Sleeve',
    ]);
  });

  it('sanitizes non-ASCII to underscore', () => {
    expect(assignUniqueBlockNames(['Piña'])).toEqual(['Pi_a']);
  });

  it('disambiguates two names that collide after sanitization', () => {
    // "Piña" and "Piéa" both sanitize to "Pi_a" (ñ, é → "_")
    expect(assignUniqueBlockNames(['Piña', 'Piéa'])).toEqual(['Pi_a', 'Pi_a_2']);
  });

  it('disambiguates a three-way collision', () => {
    expect(assignUniqueBlockNames(['Piña', 'Piéa', 'Piàa'])).toEqual([
      'Pi_a',
      'Pi_a_2',
      'Pi_a_3',
    ]);
  });

  it('keeps disambiguated names within the 31-char DXF limit', () => {
    const long = 'A'.repeat(31);
    const [first, second] = assignUniqueBlockNames([long, long]);
    expect(first).toBe(long);
    expect(second).toBe('A'.repeat(29) + '_2');
    expect(second.length).toBe(31);
  });

  it('keeps multi-digit suffixes within the 31-char limit', () => {
    const long = 'A'.repeat(31);
    const names = assignUniqueBlockNames(Array(10).fill(long));
    const tenth = names[9];
    expect(tenth).toBe('A'.repeat(28) + '_10');
    expect(tenth.length).toBe(31);
  });

  it('disambiguates empty (fully stripped) names', () => {
    expect(assignUniqueBlockNames(['', ''])).toEqual(['', '_2']);
  });

  it('does not reassign a generated name to a later raw collision', () => {
    // Third piece is literally named like the generated suffix of the first two.
    expect(assignUniqueBlockNames(['Piña', 'Piéa', 'Pi_a_2'])).toEqual([
      'Pi_a',
      'Pi_a_2',
      'Pi_a_2_2',
    ]);
  });
});

describe('generateDXFAAMA — block name collisions (no lost pieces)', () => {
  it('emits two distinct, consistent block names for colliding piece names', () => {
    const dxf = generateDXFAAMA([makePiece('Piña'), makePiece('Piéa')]);
    // Each piece name appears once in BLOCK_RECORD, once in BLOCK, once in INSERT.
    expect(countLines(dxf, 'Pi_a')).toBe(3);
    expect(countLines(dxf, 'Pi_a_2')).toBe(3);
  });

  it('emits one INSERT per piece even when names collide', () => {
    const dxf = generateDXFAAMA([makePiece('Piña'), makePiece('Piéa')]);
    expect(countLines(dxf, 'INSERT')).toBe(2);
  });
});

describe('generateMultiSizeDXF — block name collisions', () => {
  it('disambiguates size-qualified names that collide via truncation', () => {
    // 30-char name + "_MM"/"_ML" both truncate to name(30)+"_" at 31 chars.
    const base = 'A'.repeat(30);
    const dxf = generateMultiSizeDXF([
      { size: 'MM', pieces: [makePiece(base)] },
      { size: 'ML', pieces: [makePiece(base)] },
    ]);
    const collided = base + '_'; // 30×A + "_", the truncated collision base
    expect(countLines(dxf, collided)).toBe(3);
    expect(countLines(dxf, 'A'.repeat(29) + '_2')).toBe(3); // suffixed within 31-char cap
    expect(countLines(dxf, 'INSERT')).toBe(2);
  });
});
