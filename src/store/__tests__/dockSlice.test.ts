/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import dockReducer, {
  persistDocks, loadDocks,
  rehydrateDocks, addDockTool, removeDockTool, resetDockTools,
  reorderDockTool, LEGACY_DEFAULT_DOCK_2D_IDS, LEGACY_DEFAULT_DOCK_2D_IDS_V2,
  LEGACY_DEFAULT_DOCK_2D_IDS_V3, LEGACY_DEFAULT_DOCK_2D_IDS_V5,
  DEFAULT_DOCK_2D_IDS, migrateDefaultDockTools,
} from '../dockSlice';

const initial = () => dockReducer(undefined, { type: '@@INIT' });

/**
 * Un sobre v1 tal como lo dejaba escrito en el navegador el `persistDocks` de
 * antes de P2: la zona AUTO dentro, con algo fijado y las sugerencias apagadas,
 * y un dock personalizado. Es la cadena de bytes, no un objeto armado en el
 * test: el que lee es `JSON.parse` sobre lo que hay en localStorage.
 */
const SOBRE_V1_DE_VERDAD =
  '{"version":1,"data":{"pinnedExtra":{"left":["grade"],"right":["bom"]},"signaling":"off","tools2d":["select","pen","notch","grainline"]}}';

describe('dockSlice persistence', () => {
  beforeEach(() => localStorage.clear());
  it('persistDocks → loadDocks round-trips, en v2', () => {
    persistDocks({ tools2d: ['select', 'notch'] });
    expect(JSON.parse(localStorage.getItem('vina-docks')!)).toEqual({ version: 2, data: { tools2d: ['select', 'notch'] } });
    expect(loadDocks()).toEqual({ tools2d: ['select', 'notch'] });
  });
  it('un sobre v1 de verdad conserva el dock de la usuaria y suelta la zona AUTO', () => {
    localStorage.setItem('vina-docks', SOBRE_V1_DE_VERDAD);
    const loaded = loadDocks();
    expect(loaded).toEqual({ tools2d: ['select', 'pen', 'notch', 'grainline'] });
    persistDocks(loaded!);
    expect(JSON.parse(localStorage.getItem('vina-docks')!)).toEqual({
      version: 2, data: { tools2d: ['select', 'pen', 'notch', 'grainline'] },
    });
  });
  it('loadDocks returns null when nothing stored', () => {
    expect(loadDocks()).toBeNull();
  });
  it('loadDocks returns null for a corrupt envelope', () => {
    localStorage.setItem('vina-docks', JSON.stringify({ version: 99, data: { tools2d: ['select'] } }));
    expect(loadDocks()).toBeNull();
  });
  it('loadDocks returns null for wrong-typed v1 data', () => {
    localStorage.setItem('vina-docks', JSON.stringify({ version: 1, data: { pinnedExtra: { left: 'nope', right: [] } } }));
    expect(loadDocks()).toBeNull();
  });
  it('un v2 con la zona AUTO dentro no valida: v2 nació sin ella', () => {
    localStorage.setItem('vina-docks', JSON.stringify({ version: 2, data: { tools2d: ['select'], signaling: 'off' } }));
    expect(loadDocks()).toBeNull();
  });
  it('un v1 de antes de `signaling` se sigue leyendo', () => {
    localStorage.setItem('vina-docks', JSON.stringify({ version: 1, data: { pinnedExtra: { left: [], right: [] }, tools2d: ['select', 'seam'] } }));
    expect(loadDocks()).toEqual({ tools2d: ['select', 'seam'] });
  });
});

describe('dockSlice tools2d', () => {
  beforeEach(() => localStorage.clear());

  // 12 desde la auditoría de UI del 2026-08-14: `seamAllowance` y `notch` —las
  // herramientas de #1027 y #1029— no tenían puerta en el shell; para llegar a
  // piquete había que abrir el personalizador del dock. Ley de puertas (§ 5.6).
  it('defaults tools2d to the 12 ids with point between editPattern and pen (maria-203)', () => {
    expect(initial().tools2d).toEqual(DEFAULT_DOCK_2D_IDS);
    expect(DEFAULT_DOCK_2D_IDS).toEqual([
      'select', 'editPattern', 'point', 'pen', 'internalShape',
      'rectangle', 'scissors', 'measure', 'seam', 'seamEdit',
      'seamAllowance', 'notch',
    ]);
  });

  it('migrates only the exact ordered historical defaults (v1 and v2)', () => {
    expect(migrateDefaultDockTools(LEGACY_DEFAULT_DOCK_2D_IDS)).toEqual(DEFAULT_DOCK_2D_IDS);
    expect(migrateDefaultDockTools(LEGACY_DEFAULT_DOCK_2D_IDS_V2)).toEqual(DEFAULT_DOCK_2D_IDS);
    // Orden distinto al de cualquier default histórico: no migra al vigente,
    // pero 'line' sigue muerto en cualquier posición (remap de id, no de set).
    expect(migrateDefaultDockTools([...LEGACY_DEFAULT_DOCK_2D_IDS].reverse()))
      .toEqual(['seam', 'measure', 'scissors', 'rectangle', 'internalShape', 'pen', 'select']);
    expect(migrateDefaultDockTools(['select', 'pen', 'notch']))
      .toEqual(['select', 'pen', 'notch']);
  });

  it('el default V5 (con line) migra al vigente (con internalShape)', () => {
    expect(migrateDefaultDockTools([...LEGACY_DEFAULT_DOCK_2D_IDS_V5])).toEqual(DEFAULT_DOCK_2D_IDS);
  });

  it('un dock personalizado recibe internalShape en la ranura de line, sin duplicar', () => {
    expect(migrateDefaultDockTools(['select', 'line', 'notch'])).toEqual(['select', 'internalShape', 'notch']);
    expect(migrateDefaultDockTools(['internalShape', 'line', 'notch'])).toEqual(['internalShape', 'notch']);
  });

  it('el default vigente de 9 migra al de 10 con seamEdit', () => {
    expect(migrateDefaultDockTools([...LEGACY_DEFAULT_DOCK_2D_IDS_V3]))
      .toEqual(DEFAULT_DOCK_2D_IDS);
  });

  it('seamEdit va justo detrás de seam', () => {
    const i = DEFAULT_DOCK_2D_IDS.indexOf('seam');
    expect(DEFAULT_DOCK_2D_IDS[i + 1]).toBe('seamEdit');
  });

  it('un set personalizado sigue respetándose byte a byte', () => {
    const custom = ['select', 'seam'];
    expect(migrateDefaultDockTools(custom)).toEqual(custom);
  });

  it('does not duplicate editPattern in an already-current or customized dock', () => {
    expect(migrateDefaultDockTools(DEFAULT_DOCK_2D_IDS))
      .toEqual(DEFAULT_DOCK_2D_IDS);
    expect(migrateDefaultDockTools(DEFAULT_DOCK_2D_IDS)
      .filter((id) => id === 'editPattern')).toHaveLength(1);
  });

  it('loadDocks migrates a persisted historical default and round-trips it as v2', () => {
    localStorage.setItem('vina-docks', JSON.stringify({
      version: 1,
      data: {
        pinnedExtra: { left: [], right: [] },
        signaling: 'subtle',
        tools2d: [...LEGACY_DEFAULT_DOCK_2D_IDS],
      },
    }));
    const loaded = loadDocks();
    expect(loaded?.tools2d).toEqual(DEFAULT_DOCK_2D_IDS);
    persistDocks(loaded!);
    expect(loadDocks()?.tools2d).toEqual(DEFAULT_DOCK_2D_IDS);
  });

  it('addDockTool appends a new id once (idempotent)', () => {
    let s = dockReducer(initial(), addDockTool('notch'));
    s = dockReducer(s, addDockTool('notch'));
    expect(s.tools2d.filter((x) => x === 'notch')).toEqual(['notch']);
    expect(s.tools2d).toContain('notch');
  });

  it('removeDockTool removes an id', () => {
    const s = dockReducer(initial(), removeDockTool('pen'));
    expect(s.tools2d).not.toContain('pen');
  });

  it('removeDockTool is a no-op when it would empty the set', () => {
    let s = dockReducer(initial(), resetDockTools());
    for (const id of [...s.tools2d].filter((x) => x !== 'select')) s = dockReducer(s, removeDockTool(id));
    expect(s.tools2d).toEqual(['select']);
    s = dockReducer(s, removeDockTool('select'));
    expect(s.tools2d).toEqual(['select']); // last one stays
  });

  it('resetDockTools restores the defaults', () => {
    let s = dockReducer(initial(), addDockTool('notch'));
    s = dockReducer(s, removeDockTool('pen'));
    s = dockReducer(s, resetDockTools());
    expect(s.tools2d).toEqual(DEFAULT_DOCK_2D_IDS);
  });

  it('rehydrateDocks sets tools2d', () => {
    const s = dockReducer(initial(), rehydrateDocks({ tools2d: ['select', 'seam'] }));
    expect(s.tools2d).toEqual(['select', 'seam']);
  });

  it('loadDocks defaults tools2d for a pre-slice-4 envelope (no tools2d key)', () => {
    localStorage.setItem('vina-docks', JSON.stringify({ version: 1, data: { pinnedExtra: { left: [], right: [] }, signaling: 'subtle' } }));
    const loaded = loadDocks();
    expect(loaded).not.toBeNull();
    expect(loaded!.tools2d).toEqual(DEFAULT_DOCK_2D_IDS);
  });

  it('loadDocks discards an envelope with a non-array tools2d', () => {
    localStorage.setItem('vina-docks', JSON.stringify({ version: 1, data: { pinnedExtra: { left: [], right: [] }, signaling: 'subtle', tools2d: 'nope' } }));
    expect(loadDocks()).toBeNull();
  });

  it('NEW_PROJECT does not reset tools2d', () => {
    const added = dockReducer(initial(), addDockTool('notch'));
    const after = dockReducer(added, { type: 'global/newProject' });
    expect(after.tools2d).toContain('notch');
  });
});

describe('dockSlice reorderDockTool', () => {
  const seed = (ids: string[]) => dockReducer(initial(), rehydrateDocks({ tools2d: ids }));

  it('up-move: dragging a lower tool onto a higher one lands it before the target', () => {
    const s = dockReducer(seed(['select', 'pen', 'notch']), reorderDockTool({ fromId: 'notch', toId: 'select' }));
    expect(s.tools2d).toEqual(['notch', 'select', 'pen']);
  });

  it('down-move: dragging a higher tool onto a lower one lands it immediately before the target', () => {
    const s = dockReducer(seed(['select', 'pen', 'notch']), reorderDockTool({ fromId: 'select', toId: 'notch' }));
    expect(s.tools2d).toEqual(['pen', 'select', 'notch']);
  });

  it('fromId === toId is a no-op', () => {
    const s = dockReducer(seed(['select', 'pen', 'notch']), reorderDockTool({ fromId: 'pen', toId: 'pen' }));
    expect(s.tools2d).toEqual(['select', 'pen', 'notch']);
  });

  it('an absent id is a no-op', () => {
    const s = dockReducer(seed(['select', 'pen', 'notch']), reorderDockTool({ fromId: 'zzz', toId: 'select' }));
    expect(s.tools2d).toEqual(['select', 'pen', 'notch']);
  });

  it('preserves length', () => {
    const s = dockReducer(seed(['select', 'pen', 'notch']), reorderDockTool({ fromId: 'pen', toId: 'select' }));
    expect(s.tools2d).toHaveLength(3);
  });
});
