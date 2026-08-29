/** @vitest-environment jsdom */
// El store real (`src/store`) abre IndexedDB al importarse (autoguardado,
// input scheme, historial causal) y toca `window`. `fake-indexeddb/auto`
// pone un IndexedDB de verdad (en memoria) en el global antes de que
// `store/index.ts` corra su `void initProjectPersistence(store)` de módulo:
// sin datos previos, hidrata a "sin proyecto" y no lanza. Ver informe de la
// Tarea 4 para qué se probó sin este import (fallaba con IDB no definida).
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { store } from '../../../store';
import { EXPORTED_SLICES } from '../diagnosticExporter';

/** Los cuatro slices que el bundle exporta por su cuenta, fuera de `slices`. */
const EXPORTED_ELSEWHERE = ['project', 'avatar', 'simulation', 'inspector'];

describe('EXPORTED_SLICES — trinquete contra el store real', () => {
  it('cubre exactamente los slices del store menos los cuatro exportados aparte', () => {
    expect([...EXPORTED_ELSEWHERE, ...EXPORTED_SLICES].sort())
      .toEqual(Object.keys(store.getState()).sort());
  });
});
