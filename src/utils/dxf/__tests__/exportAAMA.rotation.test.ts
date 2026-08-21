import { describe, it, expect } from 'vitest';
import { generateDXFAAMA } from '../exportAAMA';
import type { PatternPiece, PathCommand } from '../../../types/types';

/**
 * `piece.rotation` tiene que llegar al archivo de corte.
 *
 * Antes de #1033 el exportador escribía `piece.outline` crudo y no mencionaba
 * `rotation` ni una vez, así que el giro solo salía en el DXF cuando venía
 * horneado en las coordenadas. Con el tirador de giro pasando a declarativo,
 * sin esto TODA rotación se perdería al exportar — la pantalla y la tela
 * dirían cosas distintas.
 */

/** Barra 100 × 20, centro local (50,10). Girada 90° sobre su centro pasa a
 *  ocupar x 40..60, y −40..60: ningún 100 y dos 60. */
const BARRA: PathCommand[] = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [100, 0] },
  { type: 'L', values: [100, 20] },
  { type: 'L', values: [0, 20] },
  { type: 'Z', values: [] },
];

function barra(rotation: number): PatternPiece {
  return {
    id: 'p1', name: 'Barra', outline: BARRA,
    seamAllowance: 0, position: { x: 0, y: 0 }, rotation, mirrored: false,
    internals: [],
    layer: 1, sublayer: 0, active: true, createdAt: 0, updatedAt: 0,
  } as unknown as PatternPiece;
}

describe('generateDXFAAMA — el giro de la pieza llega al corte (#1033)', () => {
  it('escribe el contorno girado cuando la pieza trae rotación', () => {
    const dxf = generateDXFAAMA([barra(90)]);
    expect(dxf).toContain('60.0000');
    expect(dxf).toContain('40.0000');
  });

  it('sin rotación no aparece ninguna coordenada del giro', () => {
    const dxf = generateDXFAAMA([barra(0)]);
    expect(dxf).not.toContain('60.0000');
  });

  it('girar cambia el archivo', () => {
    expect(generateDXFAAMA([barra(90)])).not.toBe(generateDXFAAMA([barra(0)]));
  });

  it('las líneas internas giran con el contorno, no se quedan atrás', () => {
    const conHilo = {
      ...barra(90),
      internals: [{
        id: 'gl1', type: 'grainline',
        path: [{ type: 'M', values: [50, 0] }, { type: 'L', values: [50, 20] }],
      }],
    } as unknown as PatternPiece;
    // El hilo vertical (50,0)→(50,20), girado 90° sobre (50,10), queda
    // horizontal: (60,10)→(40,10). En DXF la Y se niega: −10.0000.
    const dxf = generateDXFAAMA([conHilo]);
    expect(dxf).toContain('-10.0000');
  });
});
