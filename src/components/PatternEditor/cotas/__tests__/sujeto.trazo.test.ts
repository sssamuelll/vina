import { describe, it, expect, vi, afterEach } from 'vitest';
import { cotasDelSujeto } from '../sujeto';
import type { PathCommand, PatternPiece, Trazo } from '../../../../types/types';
import * as snapIndexModule from '../../snapIndex';

/**
 * El tramo de trazo seleccionado es un sujeto más (spec 2026-09-12 § 5.3):
 * gana a la pieza que hubiera seleccionada y se apaga con las mismas
 * compuertas que los demás. `trazos` llega ya filtrado por visibilidad, así
 * que un trazo ausente —oculto o borrado por deshacer— no tiene sujeto.
 */
const rect = (w: number, h: number): PathCommand[] => [
  { type: 'M', values: [0, 0] }, { type: 'L', values: [w, 0] }, { type: 'L', values: [w, h] }, { type: 'L', values: [0, h] }, { type: 'Z', values: [] },
];
const pieza = (id: string): PatternPiece => ({
  id, name: id, outline: rect(100, 100), internals: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false,
  seamAllowance: 0, active: true, createdAt: 0, updatedAt: 0,
} as PatternPiece);
const trazo: Trazo = { id: 't', createdAt: 1, path: [
  { type: 'M', values: [0, 0] }, { type: 'L', values: [100, 0] }, { type: 'L', values: [100, 50] },
] };
const base = {
  activeTool: 'select' as const, pieces: [pieza('a')], selectedPieceIds: [] as string[],
  selectedInternalLine: null, hotId: null,
  isDragging: false, contextMenuOpen: false, calibrationActive: false,
  hiddenLayerIds: [] as number[], layerLocked: {} as Record<number, boolean>,
};
const defaultRect = { width: 300, height: 150 };

describe('cotasDelSujeto con un trazo seleccionado', () => {
  afterEach(() => vi.restoreAllMocks());

  it('con un tramo de trazo seleccionado, el sujeto son sus dos cotas y la tira lo dice', () => {
    const s = cotasDelSujeto({ ...base, activeTool: 'select', trazos: [trazo], selectedTrazo: { trazoId: 't', segmentIndex: 2 } }, defaultRect);
    expect(s.piece).toBeNull();
    expect(s.cotas.map(c => c.kind)).toEqual(['tramo-largo', 'tramo-angulo']);
    expect(s.lineaDeSujeto).toBe('Editando: el tramo seleccionado');
    expect(s.disabled).toBe(false);
  });
  it('arrastrando, o con la construcción oculta, no hay sujeto de trazo', () => {
    expect(cotasDelSujeto({ ...base, trazos: [trazo], selectedTrazo: { trazoId: 't', segmentIndex: 2 }, isDragging: true }, defaultRect).cotas).toEqual([]);
    expect(cotasDelSujeto({ ...base, trazos: [], selectedTrazo: { trazoId: 't', segmentIndex: 2 } }, defaultRect).cotas).toEqual([]);
  });

  // `cotasDeTrazo` cachea su índice de enganche por identidad del array de
  // piezas que recibe; sin memoizar el filtro aquí, `sujeto.ts` le pasaba un
  // `Array.prototype.filter` nuevo en cada llamada y la caché de abajo
  // fallaba siempre — un cache-buster invisible desde `cotas.ts`.
  it('dos llamadas seguidas con las MISMAS input.pieces + hiddenLayerIds no reconstruyen el índice de enganche', () => {
    const spy = vi.spyOn(snapIndexModule, 'buildSnapIndex');
    // Array propio, nunca visto por la caché de otra prueba de este archivo
    // (`base.pieces`/`base.hiddenLayerIds` son fijos y varias pruebas ya los
    // usaron — reusarlos aquí daría un acierto de caché heredado, no el que
    // esta prueba dice medir).
    const input = {
      ...base, pieces: [pieza('z')], hiddenLayerIds: [] as number[],
      trazos: [trazo], selectedTrazo: { trazoId: 't', segmentIndex: 2 },
    };
    cotasDelSujeto(input, defaultRect);
    cotasDelSujeto(input, defaultRect);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
