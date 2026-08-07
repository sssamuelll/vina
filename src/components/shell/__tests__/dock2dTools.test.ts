import { describe, it, expect } from 'vitest';
import { DOCK_2D_CATALOG, getDockToolById } from '../dock2dTools';
import { DEFAULT_DOCK_2D_IDS } from '../../../store/dockSlice';

describe('dock2dTools catalog', () => {
  it('has 13 entries (3 unwired phantom tools removed #529; point añadido maria-203)', () => {
    expect(DOCK_2D_CATALOG).toHaveLength(13);
  });

  it('drops the unwired phantom tools but keeps internalShape (María needs Forma interna)', () => {
    // grading / textAnnotation / addPiece had no canvas mousedown handler → silent
    // no-op; their real behavior lives in the Grading panel, Properties panel, and
    // pen/rectangle respectively. internalShape stays: María wants it (to be wired).
    expect(getDockToolById('grading')).toBeUndefined();
    expect(getDockToolById('textAnnotation')).toBeUndefined();
    expect(getDockToolById('addPiece')).toBeUndefined();
    expect(getDockToolById('internalShape')?.label).toBe('Forma interna');
  });

  it('surfaces the seamAllowance tool (reachability — María, hallazgo #2)', () => {
    const sa = getDockToolById('seamAllowance');
    expect(sa).toBeTruthy();
    expect(sa!.label).toBe('Margen de costura');
    expect(sa!.shortcut).toBe('O');
  });

  it('surfaces the point tool between editar y pluma, sin atajo a propósito (maria-203)', () => {
    const point = getDockToolById('point');
    expect(point).toBeTruthy();
    expect(point!.label).toBe('Punto');
    // Sin shortcut: el catálogo documenta atajos reales de CLO3D y CLO no le
    // da atajo a su Add Point — inventarle uno enseñaría un hábito falso.
    expect(point!.shortcut).toBeUndefined();
    const ids = DOCK_2D_CATALOG.map((t) => t.id);
    expect(ids.indexOf('point')).toBe(ids.indexOf('editPattern') + 1);
    expect(ids.indexOf('pen')).toBe(ids.indexOf('point') + 1);
  });

  it('getDockToolById resolves a member and is undefined for an unknown id', () => {
    expect(getDockToolById('select')?.label).toBe('Seleccionar');
    expect(getDockToolById('nope')).toBeUndefined();
  });

  it('every default id resolves in the catalog (drift guard)', () => {
    for (const id of DEFAULT_DOCK_2D_IDS) {
      expect(getDockToolById(id), `default id "${id}" missing from catalog`).toBeTruthy();
    }
  });

  it('catalog ids are all distinct', () => {
    const ids = DOCK_2D_CATALOG.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('the first 9 catalog ids are the defaults in order', () => {
    expect(DOCK_2D_CATALOG.slice(0, 9).map((tool) => tool.id))
      .toEqual(DEFAULT_DOCK_2D_IDS);
  });
});
