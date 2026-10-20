import { describe, it, expect } from 'vitest';
import { cotasDelSujeto, type SujetoInput } from '../sujeto';
import type { PatternPiece, PathCommand, SemanticEdge, Tool2D } from '../../../../types/types';

/**
 * Spec 2026-09-02 § 5.4: con la herramienta de margen el sujeto es el borde
 * anclado (una cota, si hay un solo borde seleccionado y el ancla coincide) y
 * la LECTURA es el borde bajo el ratón. Las cinco compuertas de siempre se
 * heredan; la lectura se suprime cuando diría el mismo número que el ancla
 * (misma fuente, mismo tramo) y nunca con otra herramienta.
 */
const rect = (w: number, h: number): PathCommand[] => [
  { type: 'M', values: [0, 0] }, { type: 'L', values: [w, 0] }, { type: 'L', values: [w, h] }, { type: 'L', values: [0, h] }, { type: 'Z', values: [] },
];
const bordes = (id: string, over: Partial<SemanticEdge> = {}): SemanticEdge[] => [
  { id: `${id}:top`, name: 'top', segmentRange: [1, 2], edgeType: 'seam', ...over },
  { id: `${id}:right`, name: 'right', segmentRange: [2, 3], edgeType: 'seam' },
];
const pieza = (id: string, over: Partial<PatternPiece> = {}): PatternPiece => ({
  id, name: id, outline: rect(200, 100), internals: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false,
  seamAllowance: 10, active: true, createdAt: 0, updatedAt: 0, edges: bordes(id), ...over,
} as PatternPiece);

const base: SujetoInput = {
  activeTool: 'seamAllowance', pieces: [pieza('a'), pieza('b', { locked: true }), pieza('c', { layer: 2 })],
  selectedPieceIds: [], selectedInternalLine: null, hotId: null,
  isDragging: false, contextMenuOpen: false, calibrationActive: false,
  hiddenLayerIds: [], layerLocked: {},
  saSelection: null, saAncla: null, saHover: null,
};
const sel = (...ids: Array<[string, string]>) => ({ kind: 'edge' as const, items: ids.map(([pieceId, edgeId]) => ({ pieceId, edgeId })) });
const en = (pieceId: string, edgeId: string, t: number) => ({ pieceId, edgeId, t });

describe('cotasDelSujeto — margen: el ancla', () => {
  it('un borde seleccionado con ancla que coincide: UNA cota de margen, "Editando: el margen del borde"', () => {
    const s = cotasDelSujeto({ ...base, saSelection: sel(['a', 'a:top']), saAncla: en('a', 'a:top', 0.5) });
    expect(s.cotas.map(c => c.kind)).toEqual(['margen']);
    expect(s.cotas[0]).toMatchObject({ valueMm: 10, primary: false, rotulo: 'de la pieza' });
    expect(s.piece?.id).toBe('a');
    expect(s.disabled).toBe(false);
    expect(s.caliente).toBe(false);
  });

  it('sin selección, o con selección sin ancla, o con ancla que no coincide: sin cotas', () => {
    expect(cotasDelSujeto({ ...base, saAncla: en('a', 'a:top', 0.5) }).cotas).toEqual([]);
    expect(cotasDelSujeto({ ...base, saSelection: sel(['a', 'a:top']) }).cotas).toEqual([]);
    expect(cotasDelSujeto({ ...base, saSelection: sel(['a', 'a:top']), saAncla: en('a', 'a:right', 0.5) }).cotas).toEqual([]);
  });

  it('Shift: dos bordes seleccionados → cero anclados (manda el panel)', () => {
    const s = cotasDelSujeto({ ...base, saSelection: sel(['a', 'a:top'], ['a', 'a:right']), saAncla: en('a', 'a:top', 0.5) });
    expect(s.cotas).toEqual([]);
  });

  it('una esquina seleccionada no tiene ancho: cero cotas', () => {
    const s = cotasDelSujeto({
      ...base, saSelection: { kind: 'vertex', items: [{ pieceId: 'a', vertexIndex: 0 }] }, saAncla: en('a', 'a:top', 0.5),
    });
    expect(s.cotas).toEqual([]);
  });

  it('el borde del ancla ya no existe (undo reescribió el contorno): sin cotas, sin crash', () => {
    const s = cotasDelSujeto({ ...base, saSelection: sel(['a', 'a:zzz']), saAncla: en('a', 'a:zzz', 0.5) });
    expect(s.cotas).toEqual([]);
  });

  it('pieza bloqueada y capa bloqueada: la cota está pero apagada', () => {
    expect(cotasDelSujeto({ ...base, saSelection: sel(['b', 'b:top']), saAncla: en('b', 'b:top', 0.5) }))
      .toMatchObject({ disabled: true });
    expect(cotasDelSujeto({ ...base, layerLocked: { 2: true }, saSelection: sel(['c', 'c:top']), saAncla: en('c', 'c:top', 0.5) }))
      .toMatchObject({ disabled: true });
  });

  it.each([
    ['capa oculta', { saSelection: sel(['c', 'c:top']), saAncla: en('c', 'c:top', 0.5), saHover: en('c', 'c:right', 0.5), hiddenLayerIds: [2] }],
    ['arrastrando', { saSelection: sel(['a', 'a:top']), saAncla: en('a', 'a:top', 0.5), saHover: en('a', 'a:right', 0.5), isDragging: true }],
    ['menú abierto', { saSelection: sel(['a', 'a:top']), saAncla: en('a', 'a:top', 0.5), saHover: en('a', 'a:right', 0.5), contextMenuOpen: true }],
    ['calibrando', { saSelection: sel(['a', 'a:top']), saAncla: en('a', 'a:top', 0.5), saHover: en('a', 'a:right', 0.5), calibrationActive: true }],
  ])('sin cotas ni lectura: %s', (_n, over) => {
    const s = cotasDelSujeto({ ...base, ...over });
    expect(s.cotas).toEqual([]);
    expect(s.lectura).toBeNull();
    // El resalte del borde pasa por las MISMAS compuertas que el chip (revisión 02-09).
    expect(s.bordeLeido).toBeNull();
  });
});

describe('cotasDelSujeto — margen: la lectura (hover)', () => {
  it('el borde bajo el ratón produce una lectura con su valor y su fuente, y nombra el borde para el resalte', () => {
    const s = cotasDelSujeto({ ...base, saHover: en('a', 'a:top', 0.3) });
    expect(s.lectura).toMatchObject({ kind: 'margen', valueMm: 10, rotulo: 'de la pieza', primary: false });
    expect(s.bordeLeido).toEqual({ pieceId: 'a', edgeId: 'a:top' });
    expect(s.lecturaApagada).toBe(false);
    expect(s.cotas).toEqual([]);
  });

  it('sobre la misma fuente que el ancla se suprime el chip (sería el mismo número dos veces), no el resalte', () => {
    const s = cotasDelSujeto({ ...base, saSelection: sel(['a', 'a:top']), saAncla: en('a', 'a:top', 0.2), saHover: en('a', 'a:top', 0.8) });
    expect(s.cotas).toHaveLength(1);
    expect(s.lectura).toBeNull();
    expect(s.bordeLeido).toEqual({ pieceId: 'a', edgeId: 'a:top' });
  });

  it('sobre OTRO borde con uno anclado: dos chips (ancla + lectura)', () => {
    const s = cotasDelSujeto({ ...base, saSelection: sel(['a', 'a:top']), saAncla: en('a', 'a:top', 0.2), saHover: en('a', 'a:right', 0.5) });
    expect(s.cotas).toHaveLength(1);
    expect(s.lectura?.id).toBe('margen:a:a:right');
  });

  it('el mismo borde pero un TRAMO distinto del ancla sí lee: no es el mismo número', () => {
    const conTramo = pieza('a', { edges: bordes('a', { seamAllowanceSpans: [{ tStart: 0.6, tEnd: 1, width: 25 }] }) });
    const input = { ...base, pieces: [conTramo], saSelection: sel(['a', 'a:top']), saAncla: en('a', 'a:top', 0.2) };
    expect(cotasDelSujeto({ ...input, saHover: en('a', 'a:top', 0.8) }).lectura)
      .toMatchObject({ valueMm: 25, rotulo: 'del tramo' });
    expect(cotasDelSujeto({ ...input, saHover: en('a', 'a:top', 0.3) }).lectura).toBeNull();
  });

  it('pieza bloqueada bajo el ratón: la lectura sale apagada; el candado del ancla es otro (revisión 02-09)', () => {
    const s = cotasDelSujeto({ ...base, saHover: en('b', 'b:top', 0.5) });
    expect(s.lectura).not.toBeNull();
    expect(s.lecturaApagada).toBe(true);
    expect(s.disabled).toBe(false);
    // Ancla en pieza libre + lectura en pieza bloqueada: cada chip con su candado.
    const cruzado = cotasDelSujeto({ ...base, saSelection: sel(['a', 'a:top']), saAncla: en('a', 'a:top', 0.5), saHover: en('b', 'b:top', 0.5) });
    expect(cruzado.disabled).toBe(false);
    expect(cruzado.lecturaApagada).toBe(true);
    // Y al revés: ancla bloqueada, lectura libre.
    const inverso = cotasDelSujeto({ ...base, saSelection: sel(['b', 'b:top']), saAncla: en('b', 'b:top', 0.5), saHover: en('a', 'a:top', 0.5) });
    expect(inverso.disabled).toBe(true);
    expect(inverso.lecturaApagada).toBe(false);
  });

  it('capa oculta bajo el ratón: sin lectura ni resalte', () => {
    const s = cotasDelSujeto({ ...base, hiddenLayerIds: [2], saHover: en('c', 'c:top', 0.5) });
    expect(s.lectura).toBeNull();
    expect(s.bordeLeido).toBeNull();
  });

  it('con otra herramienta, un saHover colgado no produce lectura ni cotas de margen', () => {
    for (const tool of ['select', 'rectangle', 'pen', 'seam'] as Tool2D[]) {
      const s = cotasDelSujeto({ ...base, activeTool: tool, saHover: en('a', 'a:top', 0.5), saSelection: sel(['a', 'a:top']), saAncla: en('a', 'a:top', 0.5) });
      expect(s.lectura).toBeNull();
      expect(s.bordeLeido).toBeNull();
      expect(s.cotas.some(c => c.kind === 'margen')).toBe(false);
    }
  });

  it('con margen activa, una interna seleccionada colgante no manda: el sujeto es el margen', () => {
    const conLinea = pieza('a', { internals: [{ id: 'l1', type: 'reference', path: [{ type: 'M', values: [0, 20] }, { type: 'L', values: [50, 20] }] }] });
    const s = cotasDelSujeto({
      ...base, pieces: [conLinea], selectedInternalLine: { pieceId: 'a', lineId: 'l1' },
      saSelection: sel(['a', 'a:top']), saAncla: en('a', 'a:top', 0.5),
    });
    expect(s.cotas.map(c => c.kind)).toEqual(['margen']);
  });
});
