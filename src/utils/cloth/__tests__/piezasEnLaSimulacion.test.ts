import { describe, it, expect } from 'vitest';
import type { PatternPiece } from '../../../types/types';
import { porQueNoSeSimula } from '../piezasEnLaSimulacion';

const pieza = (over: Partial<PatternPiece>) => ({ id: 'p', active: true, layer: 1, ...over }) as PatternPiece;

describe('porQueNoSeSimula: las piezas que la simulación coloca y viste', () => {
  it('una pieza activa, visible y en una capa visible entra', () => {
    expect(porQueNoSeSimula(pieza({}), [], [])).toBeNull();
  });
  it('apagada, oculta en 3D o en una capa oculta no entra, y dice por qué', () => {
    expect(porQueNoSeSimula(pieza({ active: false }), [], [])).toBe('inactive');
    expect(porQueNoSeSimula(pieza({}), ['p'], [])).toBe('hidden in 3D');
    expect(porQueNoSeSimula(pieza({ layer: 0 }), [], [0])).toBe('layer 0 is hidden');
  });
  it('sin capa cuenta como la capa 1, como siempre', () => {
    expect(porQueNoSeSimula(pieza({ layer: undefined }), [], [1])).toBe('layer 1 is hidden');
  });
});
