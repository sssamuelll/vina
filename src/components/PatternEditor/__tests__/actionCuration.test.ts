import { describe, it, expect, vi } from 'vitest';
import {
  ACTIONS, CURATION, BAR_MAX_VISIBLE, BAR_ENABLED_KINDS,
  resolveTargetKind, matchRow, resolveMenuActions, resolveBarActions,
  type CurationCtx, type ActionId, type TargetKind,
} from '../actionCuration';
import type { AppDispatch } from '../../../store';
import type { PatternPiece } from '../../../types/types';

function pieceFix(locked = false): PatternPiece {
  return {
    id: 'p1', name: 'P1', position: { x: 0, y: 0 }, rotation: 0, mirrored: false,
    active: true, locked, seamAllowance: 0, outline: [], internals: [], edges: [],
  } as unknown as PatternPiece;
}

function makeCtx(over: Partial<CurationCtx> = {}): CurationCtx {
  return {
    dispatch: vi.fn() as unknown as AppDispatch,
    targetKind: 'piece', stage: 'drafted', altitude: 'body',
    pieceId: 'p1', piece: pieceFix(), selectedPieceIds: ['p1'],
    seamId: null, seam: null,
    internalLineId: null, internalLineType: null, internalLine: null,
    segmentIndex: undefined, segmentIsCurve: undefined,
    clipboard: null, groups: [], pieces: [pieceFix()],
    cb: {}, onClose: vi.fn(),
    ...over,
  };
}

describe('resolveTargetKind — precedencia y refinamiento de altitud', () => {
  it('seam gana sobre línea interna y sobre pieza', () => {
    expect(resolveTargetKind({
      seamId: 's1', pieceId: 'p1', pieceCount: 1,
      internalLineType: 'notch', altitude: 'body', segmentHit: false,
    })).toBe('seam');
  });
  it('línea interna gana sobre pieza; el subtipo cae en su cubo', () => {
    expect(resolveTargetKind({ seamId: null, pieceId: 'p1', pieceCount: 1, internalLineType: 'notch', altitude: 'body' })).toBe('il.notch');
    expect(resolveTargetKind({ seamId: null, pieceId: 'p1', pieceCount: 1, internalLineType: 'grainline', altitude: 'body' })).toBe('il.grainline');
    expect(resolveTargetKind({ seamId: null, pieceId: 'p1', pieceCount: 1, internalLineType: 'fold', altitude: 'body' })).toBe('il.fold');
    expect(resolveTargetKind({ seamId: null, pieceId: 'p1', pieceCount: 1, internalLineType: 'dart', altitude: 'body' })).toBe('il.dart');
    expect(resolveTargetKind({ seamId: null, pieceId: 'p1', pieceCount: 1, internalLineType: 'pleat', altitude: 'body' })).toBe('il.other');
    expect(resolveTargetKind({ seamId: null, pieceId: 'p1', pieceCount: 1, internalLineType: 'seam', altitude: 'body' })).toBe('il.other');
  });
  it('pieza única, multi y vacío', () => {
    expect(resolveTargetKind({ seamId: null, pieceId: 'p1', pieceCount: 1, internalLineType: null, altitude: 'body' })).toBe('piece');
    expect(resolveTargetKind({ seamId: null, pieceId: 'p1', pieceCount: 3, internalLineType: null, altitude: 'body' })).toBe('multiPiece');
    expect(resolveTargetKind({ seamId: null, pieceId: null, pieceCount: 0, internalLineType: null, altitude: 'body' })).toBe('emptyCanvas');
  });
  it('altitud POINT: segmentHit → point.segment, si no → point.node (F11)', () => {
    expect(resolveTargetKind({ seamId: null, pieceId: 'p1', pieceCount: 1, internalLineType: null, altitude: 'point', segmentHit: true })).toBe('point.segment');
    expect(resolveTargetKind({ seamId: null, pieceId: 'p1', pieceCount: 1, internalLineType: null, altitude: 'point', segmentHit: false })).toBe('point.node');
  });
});

describe('matchRow — especificidad y fallback', () => {
  it('empareja la fila del targetKind con stage/altitud comodín', () => {
    const row = matchRow({ targetKind: 'piece', stage: 'sewn', altitude: 'body' });
    expect(row?.targetKind).toBe('piece');
  });
  it('devuelve null si ningún targetKind matchea (F6: sin crash)', () => {
    const row = matchRow({ targetKind: 'unknownKind' as TargetKind, stage: 'drafted', altitude: 'body' });
    expect(row).toBeNull();
  });
});

describe('integridad de CURATION', () => {
  it('todo id de bar y menu existe en ACTIONS', () => {
    for (const row of CURATION) {
      for (const id of [...row.bar, ...row.menu]) {
        expect(ACTIONS[id], `id sin ActionDef: ${id}`).toBeDefined();
      }
    }
  });
  it('paridad: bar ⊆ menu en cada fila', () => {
    for (const row of CURATION) {
      for (const id of row.bar) {
        expect(row.menu, `${row.targetKind}: ${id} en bar pero no en menu`).toContain(id);
      }
    }
  });
  it('ningún verbo danger vive en bar', () => {
    for (const row of CURATION) {
      for (const id of row.bar) {
        expect(ACTIONS[id].danger, `danger en bar: ${id}`).not.toBe(true);
      }
    }
  });
  it('bar autorada no excede el cap de 5', () => {
    for (const row of CURATION) {
      expect(row.bar.length).toBeLessThanOrEqual(BAR_MAX_VISIBLE);
    }
  });
  it('la fila multiPiece NO autora el borrado (F3: verbo diferido = fuera de pantalla)', () => {
    const multi = CURATION.find(r => r.targetKind === 'multiPiece');
    expect(multi).toBeDefined();
    expect(multi!.menu).not.toContain('deletePiece' as ActionId);
    expect(multi!.bar).not.toContain('deletePiece' as ActionId);
  });
});

describe('gate !locked en el menú de pieza (F2)', () => {
  it('pieza bloqueada oculta rotate/flip/delete y conserva desbloquear/copiar/seleccionar', () => {
    const ctx = makeCtx({ piece: pieceFix(true), pieces: [pieceFix(true)] });
    const ids = resolveMenuActions(ctx).map(d => d.id);
    expect(ids).not.toContain('rotate90');
    expect(ids).not.toContain('flipH');
    expect(ids).not.toContain('flipV');
    expect(ids).not.toContain('deletePiece');
    expect(ids).toContain('lockToggle');
    expect(ids).toContain('copy');
    expect(ids).toContain('select');
  });
  it('pieza desbloqueada sí muestra rotate/flip/delete', () => {
    const ids = resolveMenuActions(makeCtx()).map(d => d.id);
    expect(ids).toContain('rotate90');
    expect(ids).toContain('flipH');
    expect(ids).toContain('deletePiece');
  });
});

describe('resolveBarActions — cap, no-danger y BAR_ENABLED_KINDS', () => {
  it('pieza desbloqueada: barra rankeada, ≤5, sin danger', () => {
    const bar = resolveBarActions(makeCtx()).map(d => d.id);
    expect(bar).toEqual(['rotate90', 'duplicate', 'flipH', 'properties', 'lockToggle']);
    expect(bar.length).toBeLessThanOrEqual(BAR_MAX_VISIBLE);
    for (const id of bar) expect(ACTIONS[id].danger).not.toBe(true);
  });
  it('targetKind fuera de BAR_ENABLED_KINDS (seam) → barra vacía', () => {
    expect(BAR_ENABLED_KINDS.has('seam')).toBe(false);
    expect(resolveBarActions(makeCtx({ targetKind: 'seam' }))).toEqual([]);
  });
  it('paste se oculta sin clipboard y aparece con clipboard', () => {
    const empty = makeCtx({ targetKind: 'emptyCanvas', pieceId: null, piece: null });
    expect(resolveMenuActions(empty).map(d => d.id)).not.toContain('paste');
    const withClip = makeCtx({ targetKind: 'emptyCanvas', pieceId: null, piece: null, clipboard: { pieces: [pieceFix()] } });
    expect(resolveMenuActions(withClip).map(d => d.id)).toContain('paste');
  });
});
