/**
 * #1068 — las dos puertas que guardan una linea interna.
 *
 * `usePolyPenTool` dibuja en espacio de PATRON y entrega el path tal cual.
 * Los internals se guardan piece-local, y `PieceRenderer.tsx:130` los envuelve
 * en `translate(position) rotate(rotation, cx, cy)`. Asi que guardar bien
 * significa deshacer las DOS cosas.
 *
 * Habia dos puertas al mismo dato y ninguna lo hacia entero:
 *  - "Forma interna" (#529) restaba solo `position` — el fantasma sin girar;
 *  - la pluma poligonal en modo linea interna no restaba NADA, asi que sobre
 *    una pieza que no esta en el origen la linea se guardaba corrida por la
 *    posicion entera. Ese es un error mas viejo que el giro y de otra clase:
 *    no es una conversion mal hecha, es una conversion ausente.
 *
 * `toPieceLocalPath` no aparecia en el censo del #1068 porque recibia
 * `origin: Point2D` en vez de la pieza — el 8º rodeo, el que ningun regex ve.
 */
import { describe, expect, it } from 'vitest';
import type { PathCommand, PatternPiece } from '../../../types/types';
import { toPieceLocalPath } from '../internalShapePath';
import { pieceLocalToPattern } from '../../../utils/geometry/pieceSpace';

/** 200 x 80; centro del bbox (100, 40). */
const pieza = (rotation: number, x = 0, y = 0) => ({
  id: 'p', name: 'p',
  outline: [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [200, 0] },
    { type: 'L', values: [200, 80] },
    { type: 'L', values: [0, 80] },
    { type: 'Z', values: [] },
  ],
  position: { x, y }, rotation,
  mirrored: false, seamAllowance: 0, internals: [],
}) as unknown as PatternPiece;

describe('#1068 — guardar una linea interna sobre una pieza girada', () => {
  it('lo guardado, devuelto por el transform, vuelve a donde se dibujo', () => {
    // La prueba honesta de una conversion no es un numero magico: es el
    // viaje de ida y vuelta contra el MISMO transform que usa el renderizador.
    const p = pieza(90, 300, 50);
    const dibujado: PathCommand[] = [
      { type: 'M', values: [310, 60] },
      { type: 'C', values: [320, 70, 330, 80, 340, 90] },
      { type: 'Z', values: [] },
    ];
    const guardado = toPieceLocalPath(dibujado, p);

    expect(guardado[2]).toEqual({ type: 'Z', values: [] });
    for (let c = 0; c < 2; c++) {
      for (let i = 0; i + 1 < guardado[c].values.length; i += 2) {
        const vuelta = pieceLocalToPattern(
          { x: guardado[c].values[i], y: guardado[c].values[i + 1] },
          p,
        );
        expect(vuelta.x).toBeCloseTo(dibujado[c].values[i], 6);
        expect(vuelta.y).toBeCloseTo(dibujado[c].values[i + 1], 6);
      }
    }
  });

  it('sobre una pieza girada NO es lo mismo que restar la posicion', () => {
    // El guardia: sin esto, una implementacion que ignore el giro pasaria el
    // test de arriba solo si el ida-y-vuelta tambien lo ignorara.
    const p = pieza(90, 300, 50);
    const path: PathCommand[] = [{ type: 'M', values: [310, 60] }];
    const [cmd] = toPieceLocalPath(path, p);
    expect(cmd.values[0]).not.toBeCloseTo(10, 3);
  });

  it('sin rotacion se comporta igual que siempre', () => {
    const p = pieza(0, 100, 100);
    expect(toPieceLocalPath([
      { type: 'M', values: [110, 120] },
      { type: 'C', values: [110, 120, 130, 140, 150, 160] },
    ], p)).toEqual([
      { type: 'M', values: [10, 20] },
      { type: 'C', values: [10, 20, 30, 40, 50, 60] },
    ]);
  });
});
