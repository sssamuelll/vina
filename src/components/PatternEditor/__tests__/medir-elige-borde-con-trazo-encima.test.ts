/**
 * Medir con un trazo encima del borde (revisión tarea 6, ronda 1).
 *
 * `useMeasureTool` deriva un índice «solo contorno» para los modos que eligen
 * un BORDE (`along-curve` y `compare`): ahí un extremo de interna no identifica
 * un tramo, y desde el 2026-09-12 un ancla o un cruce de trazo tampoco. Los dos
 * enganchan con `pieceId: null`, y esos modos hacen `pieces.find(p => p.id ===
 * snap.pieceId)` — con `undefined` el clic no hace NADA, en silencio.
 *
 * El caso normal de una línea de construcción es cruzar un borde. Este test
 * fija que el clic sobre el borde cerca del cruce sigue eligiendo el borde de
 * la pieza, y que en `point-to-point` —donde medir contra el cruce sí es lo que
 * la usuaria quiere— el cruce sigue enganchando.
 */
import { describe, it, expect } from 'vitest';
import { buildSnapIndex, resolveSnap, soloContorno } from '../snapIndex';
import type { PatternPiece, PathCommand, Trazo } from '../../../types/types';

const L = (x: number, y: number): PathCommand => ({ type: 'L', values: [x, y] });
const M = (x: number, y: number): PathCommand => ({ type: 'M', values: [x, y] });

/** 100 × 100 en (0,0); su borde de arriba es y = 0 entre x = 0 y x = 100. */
const pieza: PatternPiece = {
  id: 'p', name: 'p', active: true,
  outline: [M(0, 0), L(100, 0), L(100, 100), L(0, 100), { type: 'Z', values: [] }],
  internals: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false,
  seamAllowance: 0, createdAt: 1, updatedAt: 1,
} as PatternPiece;

/** Dos trazos que se cruzan en (50, 0), justo sobre el borde de arriba. */
const trazos: Trazo[] = [
  { id: 'a', createdAt: 1, path: [M(40, -10), L(60, 10)] },
  { id: 'b', createdAt: 1, path: [M(60, -10), L(40, 10)] },
];

describe('Medir — un trazo sobre el borde no puede robarle el clic al borde', () => {
  it('en point-to-point el cruce del trazo sí engancha', () => {
    const i = buildSnapIndex([pieza], trazos);
    expect(resolveSnap(i, { x: 50.5, y: 0.5 }, 2)).toEqual({
      kind: 'trazoCross', pieceId: null, point: { x: 50, y: 0 },
    });
  });

  it('en along-curve / compare el clic elige el BORDE de la pieza, con su pieceId', () => {
    const i = soloContorno(buildSnapIndex([pieza], trazos));
    const s = resolveSnap(i, { x: 50.5, y: 0.5 }, 2);
    expect(s?.kind).toBe('outline');
    expect(s?.pieceId).toBe('p');
  });

  it('el índice de solo contorno no deja ningún campo de trazo vivo', () => {
    const i = soloContorno(buildSnapIndex([pieza], trazos));
    expect(i.trazos).toEqual([]);
    expect(i.cruces).toEqual([]);
    expect(i.interioresByTrazo.size).toBe(0);
    expect(i.puntasByTrazo.size).toBe(0);
    // Lo que ya hacía: un extremo de interna tampoco identifica un tramo.
    expect(i.endsByPiece.size).toBe(0);
    // Y lo que NO toca: los anillos y vértices de las piezas siguen enteros.
    expect(i.ringsByPiece.size).toBe(1);
    expect(i.nodesByPiece.size).toBe(1);
  });
});
