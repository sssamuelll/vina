import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import projectReducer, {
  addPiece,
  cloneAsLinked,
  cloneToLayer,
  duplicatePiece,
} from '../projectSlice';
import type { PatternPiece } from '../../types/types';

/**
 * #1126 — duplicar una pieza vinculada le pasa el vínculo al clon.
 *
 * El censo de rutas de clonado da CUATRO, no una, y el issue solo nombra la
 * primera:
 *
 * | ruta                                | ¿limpia el vínculo? | ¿refresca fechas? |
 * |-------------------------------------|---------------------|-------------------|
 * | `createPastedPieces` (editorSlice)  | sí — la referencia  | sí                |
 * | `duplicatePiece`                    | **no**              | **no**            |
 * | `cloneToLayer`                      | **no** — hermano    | sí                |
 * | `cloneAsLinked`                     | lo pone A PROPÓSITO | **no**            |
 *
 * `cloneToLayer` tiene el mismo defecto y no está en el issue: se encontró
 * buscando el MECANISMO ("clonar una pieza campo por campo") en vez del
 * síntoma ("duplicar"). Y `cloneAsLinked` es el hermano bueno — su trabajo ES
 * vincular, así que el arreglo tiene que dejarlo intacto; va aquí como control
 * para que un `linkedPieceId = undefined` en lote no lo apague.
 */

const base: PatternPiece = {
  id: 'p1',
  name: 'Delantero',
  outline: [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [100, 0] },
    { type: 'L', values: [100, 200] },
    { type: 'L', values: [0, 200] },
    { type: 'Z', values: [] },
  ],
  internals: [],
  position: { x: 0, y: 0 },
  rotation: 0,
  mirrored: false,
  seamAllowance: 10,
  layer: 1,
  sublayer: 0,
  active: true,
  createdAt: 1_000,
  updatedAt: 1_000,
};

/** Store con la pieza ya vinculada a su simétrica, como la deja María. */
function conParVinculado() {
  const store = configureStore({ reducer: { project: projectReducer } });
  store.dispatch(addPiece(base));
  store.dispatch(cloneAsLinked({ pieceId: 'p1', mode: 'symmetry' }));
  return store;
}

const piezas = (s: ReturnType<typeof conParVinculado>) => s.getState().project.pieces;

describe('#1126 — el clon no hereda un vínculo que nadie pidió', () => {
  it('duplicar una pieza vinculada da una pieza suelta', () => {
    const store = conParVinculado();
    const [original, vinculada] = piezas(store);
    expect(original.linkedPieceId).toBe(vinculada.id);

    store.dispatch(duplicatePiece('p1'));

    const clon = piezas(store)[2];
    expect(clon.name).toBe('Delantero (copy)');
    expect(clon.linkedPieceId).toBeUndefined();
    expect(clon.linkMode).toBeUndefined();
    // Y la vinculada de verdad no se entera: editarla sigue moviendo a p1.
    expect(piezas(store)[1].linkedPieceId).toBe('p1');
  });

  it('clonar a otra capa una pieza vinculada da una pieza suelta', () => {
    const store = conParVinculado();

    store.dispatch(cloneToLayer({ pieceId: 'p1', direction: 'over' }));

    const clon = piezas(store)[2];
    expect(clon.name).toBe('Delantero (clone)');
    expect(clon.linkedPieceId).toBeUndefined();
    expect(clon.linkMode).toBeUndefined();
  });

  it('una pieza nueva no nace con la fecha de la vieja', () => {
    const store = conParVinculado();

    store.dispatch(duplicatePiece('p1'));

    const clon = piezas(store)[2];
    // 1000 es la fecha del original. Un clon que la hereda se ordena en el
    // historial como si llevara ahí desde el principio.
    expect(clon.createdAt).toBeGreaterThan(1_000);
    expect(clon.updatedAt).toBeGreaterThan(1_000);
  });

  it('control: cloneAsLinked SÍ vincula — su trabajo es ese', () => {
    const store = conParVinculado();
    const [original, vinculada] = piezas(store);

    expect(vinculada.linkedPieceId).toBe(original.id);
    expect(vinculada.linkMode).toBe('symmetry');
    expect(original.linkMode).toBe('symmetry');
  });
});
