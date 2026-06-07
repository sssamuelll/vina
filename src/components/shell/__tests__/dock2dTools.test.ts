import { describe, it, expect } from 'vitest';
import { DOCK_2D_CATALOG, getDockToolById } from '../dock2dTools';
import { DEFAULT_DOCK_2D_IDS } from '../../../store/dockSlice';

describe('dock2dTools catalog', () => {
  it('has 15 entries', () => {
    expect(DOCK_2D_CATALOG).toHaveLength(15);
  });

  it('surfaces the seamAllowance tool (reachability — María, hallazgo #2)', () => {
    const sa = getDockToolById('seamAllowance');
    expect(sa).toBeTruthy();
    expect(sa!.label).toBe('Seam Allowance');
    expect(sa!.shortcut).toBe('O');
  });

  it('getDockToolById resolves a member and is undefined for an unknown id', () => {
    expect(getDockToolById('select')?.label).toBe('Select');
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

  it('the first 7 catalog ids are the defaults in order', () => {
    expect(DOCK_2D_CATALOG.slice(0, 7).map((t) => t.id)).toEqual(DEFAULT_DOCK_2D_IDS);
  });
});
