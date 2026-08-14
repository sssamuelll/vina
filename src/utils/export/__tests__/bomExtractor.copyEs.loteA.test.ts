import { describe, expect, it } from 'vitest';
import type { PathCommand, PatternPiece } from '../../../types/types';
import { extractFabrics, extractInterfacing } from '../bomExtractor';

const OUTLINE: PathCommand[] = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [100, 0] },
  { type: 'L', values: [100, 100] },
  { type: 'L', values: [0, 100] },
  { type: 'Z', values: [] },
];

function piece(overrides: Partial<PatternPiece> = {}): PatternPiece {
  return {
    id: 'p1',
    name: 'Delantero',
    outline: OUTLINE,
    internals: [],
    position: { x: 0, y: 0 },
    rotation: 0,
    mirrored: false,
    seamAllowance: 10,
    active: true,
    fabricCode: 'SELF',
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  } as PatternPiece;
}

describe('copy generado para la lista de materiales', () => {
  it('nombra la tela y su descripción en español', () => {
    const [entry] = extractFabrics([piece()], []);

    expect(entry.name).toBe('Tela — SELF');
    expect(entry.description).toBe('Tela total de las piezas con código SELF');
  });

  it('presenta el tipo de entretela sin exponer el enum', () => {
    const [entry] = extractInterfacing([piece({ interfacingType: 'fusible-medium' })]);

    expect(entry.name).toBe('Entretela — fusible media');
    expect(entry.description).toBe('Entretela fusible media');
  });
});
