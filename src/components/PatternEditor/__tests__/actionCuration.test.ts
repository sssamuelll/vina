import { describe, it, expect, vi } from 'vitest';
import {
  ACTIONS, CURATION, BAR_MAX_VISIBLE, BAR_ENABLED_KINDS,
  resolveTargetKind, matchRow, resolveMenuActions, resolveBarActions,
  type CurationCtx, type ActionId, type TargetKind,
} from '../actionCuration';
import type { AppDispatch } from '../../../store';
import type { PatternPiece } from '../../../types/types';
import { convertSegmentToSpline, toManualBezier } from '../splineSegment';

function pieceFix(locked = false): PatternPiece {
  return {
    id: 'p1', name: 'P1', position: { x: 0, y: 0 }, rotation: 0, mirrored: false,
    active: true, locked, seamAllowance: 0, outline: [], internals: [], edges: [],
  } as unknown as PatternPiece;
}

function managedPiece(locked = false): PatternPiece {
  const piece = pieceFix(locked);
  return {
    ...piece,
    outline: convertSegmentToSpline([
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 100] },
      { type: 'Z', values: [] },
    ], 1, 4),
  };
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
  // #1095: 'duplicate' se pliega en el submenú 'duplicateGroup' dentro de
  // `menu` (el menú de pieza tenía 20 filas sin ninguna señal de overflow);
  // la barra (Surface A) sigue usando el verbo plano — su primer ítem del
  // submenú ES 'Duplicar' (lo verifica 1095-menu-avisa-que-hay-mas.test.ts).
  const FOLDED_INTO_SUBMENU: Partial<Record<ActionId, ActionId>> = { duplicate: 'duplicateGroup' };

  it('paridad: bar ⊆ menu en cada fila (o su verbo se plegó en un submenú del menú)', () => {
    for (const row of CURATION) {
      for (const id of row.bar) {
        const foldedInto = FOLDED_INTO_SUBMENU[id];
        const present = row.menu.includes(id) || (foldedInto !== undefined && row.menu.includes(foldedInto));
        expect(present, `${row.targetKind}: ${id} en bar pero no en menu (ni plegado)`).toBe(true);
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

describe('invertir sentido del hilo (nota de María #169)', () => {
  const grainlineCtx = (path: PatternPiece['internals'][0]['path']) => makeCtx({
    targetKind: 'il.grainline', internalLineType: 'grainline',
    internalLineId: 'gl1', internalLine: { id: 'gl1', type: 'grainline', path },
  });

  it('la fila del hilo ofrece invertir el sentido', () => {
    const path = [{ type: 'M' as const, values: [50, 100] }, { type: 'L' as const, values: [50, 200] }];
    expect(resolveMenuActions(grainlineCtx(path)).map(d => d.id)).toContain('reverseGrainline');
  });

  it('despacha el path invertido — sin esto una flecha al revés no tiene arreglo', () => {
    const ctx = grainlineCtx([
      { type: 'M', values: [50, 100] },
      { type: 'L', values: [50, 200] },
    ]);
    ACTIONS.reverseGrainline.run(ctx);
    expect(ctx.dispatch).toHaveBeenCalledWith(expect.objectContaining({
      payload: {
        pieceId: 'p1', lineId: 'gl1',
        path: [{ type: 'M', values: [50, 200] }, { type: 'L', values: [50, 100] }],
      },
    }));
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
    expect(ids).not.toContain('optimizeAllCurves');
    expect(ids).toContain('lockToggle');
    expect(ids).toContain('copy');
    expect(ids).toContain('select');
  });
  it('pieza desbloqueada sí muestra rotate/flip/delete', () => {
    const ids = resolveMenuActions(makeCtx()).map(d => d.id);
    expect(ids).toContain('rotate90');
    expect(ids).toContain('flipH');
    expect(ids).toContain('deletePiece');
    expect(ids).toContain('optimizeAllCurves');
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

// ── Nota de María #197: "¿cómo hago curva una recta? No encuentro herramienta" ──
// El verbo `convertSegment` existía desde siempre, pero SOLO en la fila
// `point.segment`, que se alcanza únicamente dentro de "Editar patrón". La barra
// no era salida posible: está suprimida en altitud POINT por construcción (G7).
// Así que el verbo sube a la fila `piece` y el gate lo esconde cuando el clic
// derecho no cae sobre el contorno.
describe('convertSegment alcanzable desde el clic derecho sobre la pieza (nota de María #197)', () => {
  const onConvertSegment = vi.fn();

  it('aparece en el menú de pieza cuando el cursor cae sobre un segmento', () => {
    const ctx = makeCtx({ segmentIndex: 2, segmentIsCurve: false });
    expect(resolveMenuActions(ctx).map(d => d.id)).toContain('convertSegment');
  });

  it('se oculta cuando el clic derecho no cae sobre el contorno', () => {
    const ctx = makeCtx({ segmentIndex: undefined });
    expect(resolveMenuActions(ctx).map(d => d.id)).not.toContain('convertSegment');
  });

  it('se oculta en una pieza bloqueada aunque haya segmento bajo el cursor', () => {
    const ctx = makeCtx({ segmentIndex: 2, piece: pieceFix(true) });
    expect(resolveMenuActions(ctx).map(d => d.id)).not.toContain('convertSegment');
  });

  it('sigue disponible dentro de "Editar patrón" (fila point.segment intacta)', () => {
    const ctx = makeCtx({ targetKind: 'point.segment', altitude: 'point', segmentIndex: 2 });
    expect(resolveMenuActions(ctx).map(d => d.id)).toEqual(['convertSegment', 'convertSegmentToPoints']);
  });

  it('la etiqueta nombra el resultado, no el estado actual', () => {
    const def = ACTIONS.convertSegment;
    const label = (c: CurationCtx) => (typeof def.label === 'function' ? def.label(c) : def.label);
    expect(label(makeCtx({ segmentIndex: 0, segmentIsCurve: false }))).toBe('Convertir en curva');
    expect(label(makeCtx({ segmentIndex: 0, segmentIsCurve: true }))).toBe('Convertir en línea');
  });

  it('pasa el pieceId del hit-test: fuera de edición no hay pieza en edición que deducir', () => {
    const ctx = makeCtx({ pieceId: 'p9', segmentIndex: 3, segmentIsCurve: false, cb: { onConvertSegment } });
    ACTIONS.convertSegment.run(ctx);
    expect(onConvertSegment).toHaveBeenCalledWith(3, true, 'p9');
  });
});

// ── Nota de María #197, la otra mitad ──────────────────────────────────────
// "No utilizo nunca curvas bezier... es muy limitante tener solo curvas bezier."
// El verbo nuevo crea la curva con los puntos SOBRE la línea. Convive con el
// bezier en vez de sustituirlo: el que quiera manejadores los sigue teniendo.
describe('convertir en curva por puntos (nota de María #197)', () => {
  const onConvertSegmentToPoints = vi.fn();

  it('se ofrece sobre un lado recto', () => {
    const ids = resolveMenuActions(makeCtx({ segmentIndex: 1, segmentIsCurve: false })).map(d => d.id);
    expect(ids).toContain('convertSegmentToPoints');
  });

  it('NO se ofrece sobre un lado que ya es curva — rehacerlo tiraría su forma', () => {
    const ids = resolveMenuActions(makeCtx({ segmentIndex: 1, segmentIsCurve: true })).map(d => d.id);
    expect(ids).not.toContain('convertSegmentToPoints');
    // El de bezier sí sigue, porque ahí sirve para volver a recta.
    expect(ids).toContain('convertSegment');
  });

  it('se oculta sin segmento bajo el cursor y en pieza bloqueada', () => {
    expect(resolveMenuActions(makeCtx({ segmentIndex: undefined })).map(d => d.id))
      .not.toContain('convertSegmentToPoints');
    expect(resolveMenuActions(makeCtx({ segmentIndex: 1, piece: pieceFix(true) })).map(d => d.id))
      .not.toContain('convertSegmentToPoints');
  });

  it('los dos verbos se distinguen por su etiqueta, no sólo por el icono', () => {
    const ctx = makeCtx({ segmentIndex: 1, segmentIsCurve: false });
    const labelOf = (id: ActionId) => {
      const def = ACTIONS[id];
      return typeof def.label === 'function' ? def.label(ctx) : def.label;
    };
    expect(labelOf('convertSegment')).toBe('Convertir en curva');
    expect(labelOf('convertSegmentToPoints')).toBe('Convertir en curva por puntos');
    expect(ACTIONS.convertSegment.icon).not.toBe(ACTIONS.convertSegmentToPoints.icon);
  });

  it('pasa el índice del segmento y el pieceId del hit-test', () => {
    const ctx = makeCtx({ pieceId: 'p7', segmentIndex: 3, cb: { onConvertSegmentToPoints } });
    ACTIONS.convertSegmentToPoints.run(ctx);
    expect(onConvertSegmentToPoints).toHaveBeenCalledWith(3, 'p7');
  });
});

describe('#1159 — salida explícita de curva por puntos', () => {
  const onConvertSegmentToBezier = vi.fn();

  it('solo aparece sobre una cadena gestionada y desbloqueada', () => {
    const managed = managedPiece();
    const ids = resolveMenuActions(makeCtx({
      piece: managed, pieces: [managed], segmentIndex: 2, segmentIsCurve: true,
    })).map(def => def.id);
    expect(ids).toContain('convertSegmentToBezier');

    const manual = { ...managed, outline: toManualBezier(managed.outline, 2)! };
    expect(resolveMenuActions(makeCtx({
      piece: manual, pieces: [manual], segmentIndex: 2, segmentIsCurve: true,
    })).map(def => def.id)).not.toContain('convertSegmentToBezier');

    const locked = { ...managed, locked: true };
    expect(resolveMenuActions(makeCtx({
      piece: locked, pieces: [locked], segmentIndex: 2, segmentIsCurve: true,
    })).map(def => def.id)).not.toContain('convertSegmentToBezier');
  });

  it('nombra la salida y entrega índice y pieza al callback', () => {
    const managed = managedPiece();
    const ctx = makeCtx({
      pieceId: 'p1', piece: managed, pieces: [managed], segmentIndex: 3,
      segmentIsCurve: true, cb: { onConvertSegmentToBezier },
    });
    expect(ACTIONS.convertSegmentToBezier.label).toBe('Convertir a Bézier libre');
    ACTIONS.convertSegmentToBezier.run(ctx);
    expect(onConvertSegmentToBezier).toHaveBeenCalledWith(3, 'p1');
  });
});
