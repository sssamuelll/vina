// @vitest-environment jsdom
/**
 * #1095 — el menú de pieza (20 filas, 755px) se recorta sin ninguna señal en
 * una laptop de 768px. María, dos veces en la misma sesión: "esto está
 * cortado y no sé muy bien lo que pone" / "sigue cortado, no veo qué hay
 * aquí debajo".
 *
 * Dos piezas, verificadas por separado:
 * 1. `computeScrollFade` — la lógica pura que decide si hay más contenido
 *    arriba/abajo del scroll. jsdom no calcula layout real (getBoundingClientRect
 *    da 0), así que se prueba con medidas fabricadas — el resultado real en
 *    pantalla lo verifica el e2e con elementFromPoint.
 * 2. La consolidación de "Duplicar" en un submenú — baja el piso de filas
 *    (20→18 en el caso común), mismo patrón que ya usan Orden y Capa.
 */
import { describe, it, expect } from 'vitest';
import { computeScrollFade } from '../menuOverflow';
import {
  ACTIONS, CURATION, resolveMenuActions, type CurationCtx,
} from '../actionCuration';

describe('#1095 — computeScrollFade: pura, sin DOM real', () => {
  it('sin overflow (todo cabe): ni arriba ni abajo', () => {
    expect(computeScrollFade({ scrollTop: 0, clientHeight: 625, scrollHeight: 625 }))
      .toEqual({ top: false, bottom: false });
  });

  it('con overflow, scroll arriba del todo: solo señal abajo', () => {
    expect(computeScrollFade({ scrollTop: 0, clientHeight: 625, scrollHeight: 755 }))
      .toEqual({ top: false, bottom: true });
  });

  it('con overflow, a mitad de scroll: señal arriba Y abajo', () => {
    expect(computeScrollFade({ scrollTop: 60, clientHeight: 625, scrollHeight: 755 }))
      .toEqual({ top: true, bottom: true });
  });

  it('con overflow, scroll al fondo: solo señal arriba (el caso de María — "Eliminar pieza" ya visible)', () => {
    expect(computeScrollFade({ scrollTop: 130, clientHeight: 625, scrollHeight: 755 }))
      .toEqual({ top: true, bottom: false });
  });

  it('tolera el redondeo de subpíxel: 0.4px de resto no cuenta como overflow', () => {
    expect(computeScrollFade({ scrollTop: 0, clientHeight: 625, scrollHeight: 625.4 }))
      .toEqual({ top: false, bottom: false });
  });
});

describe('#1095 — "Duplicar" se pliega en submenú (baja el piso de filas)', () => {
  const baseCtx = (overrides: Partial<CurationCtx> = {}): CurationCtx => ({
    dispatch: () => {}, targetKind: 'piece', stage: 'draft', altitude: 'body',
    pieceId: 'p1', piece: null, selectedPieceIds: ['p1'],
    seamId: null, seam: null, saEdgeId: null,
    internalLineId: null, internalLineType: null, internalLine: null,
    segmentIndex: undefined, segmentIsCurve: undefined,
    clipboard: null, groups: [], pieces: [],
    cb: {}, onClose: () => {},
    ...overrides,
  } as unknown as CurationCtx);

  it('el registro de acciones ya no lista duplicate/cloneLinkedSymmetry/cloneLinkedInstance sueltos en el menú de pieza', () => {
    const row = CURATION.find(r => r.targetKind === 'piece' && r.altitude === 'body')!;
    expect(row.menu).not.toContain('duplicate');
    expect(row.menu).not.toContain('cloneLinkedSymmetry');
    expect(row.menu).not.toContain('cloneLinkedInstance');
    expect(row.menu).toContain('duplicateGroup');
  });

  it('la barra (Surface A) NO cambia: sigue usando duplicate suelto, no el submenú', () => {
    const row = CURATION.find(r => r.targetKind === 'piece' && r.altitude === 'body')!;
    expect(row.bar).toContain('duplicate');
    expect(row.bar).not.toContain('duplicateGroup');
  });

  it('resuelve a UNA fila (el submenú), no a tres, para una pieza normal', () => {
    const defs = resolveMenuActions(baseCtx());
    const identityIshIds = defs.map(d => d.id);
    expect(identityIshIds).toContain('duplicateGroup');
    expect(identityIshIds).not.toContain('duplicate');
    expect(identityIshIds).not.toContain('cloneLinkedSymmetry');
    expect(identityIshIds).not.toContain('cloneLinkedInstance');
  });

  it('el submenú de Duplicar trae las 3 opciones cuando la pieza es clonable (caso común)', () => {
    const ctx = baseCtx();
    const def = ACTIONS.duplicateGroup;
    expect(def).toBeDefined();
    expect(def.submenu).toBeDefined();
    const items = def.submenu!(ctx);
    expect(items.map(i => i.label)).toEqual([
      'Duplicar',
      'Con edición vinculada – simetría',
      'Con edición vinculada – instancia',
    ]);
  });

  it('el submenú de Duplicar trae SOLO "Duplicar" cuando hay 2 piezas seleccionadas (no clonable)', () => {
    const ctx = baseCtx({ selectedPieceIds: ['p1', 'p2'] });
    const items = ACTIONS.duplicateGroup.submenu!(ctx);
    expect(items.map(i => i.label)).toEqual(['Duplicar']);
  });

  it('"Duplicar" del submenú dispara el mismo verbo que el duplicate suelto (duplicatePiece)', () => {
    const dispatched: unknown[] = [];
    const fakeDispatch = ((a: unknown) => { dispatched.push(a); }) as unknown as CurationCtx['dispatch'];
    const ctx = baseCtx({ dispatch: fakeDispatch });
    const items = ACTIONS.duplicateGroup.submenu!(ctx);
    items[0].action!();
    expect(dispatched).toHaveLength(1);
    expect((dispatched[0] as { type: string }).type).toMatch(/duplicatePiece/i);
  });
});
