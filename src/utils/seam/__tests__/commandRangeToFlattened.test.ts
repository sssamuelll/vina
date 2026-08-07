/**
 * Tests for `commandRangeToFlattened` — the single canonical
 * command-space → flattened-space boundary (Fase 3 / BP-3 del plan
 * docs/plans/2026-06-11-clo3d-seam-sewing-parity-plan.md).
 *
 * El contrato del productor (`detectSemanticEdges`): segmentRange =
 * [start, end) sobre el array de PathCommand. El contrato del consumidor
 * (`parameterizeEdge`/picker/highlight): rango INCLUSIVO de puntos sobre
 * el outline aplanado, donde cada C/Q expande a `resolution` puntos.
 */
import { describe, it, expect } from 'vitest';
import { commandRangeToFlattened, flattenPath, flattenPathWithSource, resolveEdgePolyline } from '../index';
import type { PathCommand } from '../../../types/types';

// Cuadrado con cierre EXPLÍCITO (el lado izquierdo es un comando real,
// no el Z): comandos 1..4 son draw commands.
const square: PathCommand[] = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [10, 0] }, // 1: top
  { type: 'L', values: [10, 10] }, // 2: right
  { type: 'L', values: [0, 10] }, // 3: bottom
  { type: 'L', values: [0, 0] }, // 4: left
  { type: 'Z', values: [] },
];

// El fixture curvo de la Fase 0: la curva es el comando 2 y aplana a 12
// puntos (pts 2..13), con anchor en pt1.
const curved: PathCommand[] = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [10, 0] }, // 1: top
  { type: 'C', values: [12, 4, 12, 8, 10, 12] }, // 2: right (curva)
  { type: 'L', values: [0, 12] }, // 3: bottom
  { type: 'Z', values: [] }, // cierra el lado izquierdo (sin comando)
];

describe('commandRangeToFlattened', () => {
  it('maps straight-edge command ranges to anchored point ranges', () => {
    // Comando i (recto) emite 1 punto; su anchor es el endpoint del
    // comando anterior → [i, i+1) en comandos = [i-1, i] en puntos.
    expect(commandRangeToFlattened(square, [1, 2])).toEqual([0, 1]); // top
    expect(commandRangeToFlattened(square, [2, 3])).toEqual([1, 2]); // right
    expect(commandRangeToFlattened(square, [3, 4])).toEqual([2, 3]); // bottom
    expect(commandRangeToFlattened(square, [4, 5])).toEqual([3, 4]); // left
  });

  it('expands a curve command to its full sampled point range', () => {
    // El bug BP-3 en una línea: [2,3] en comandos NO es [2,3] en puntos.
    expect(commandRangeToFlattened(curved, [2, 3])).toEqual([1, 13]);
  });

  it('maps a multi-command group (straight + curve) to the combined range', () => {
    // Grupo top+curva como lo emitiría el detector si compartieran zona.
    expect(commandRangeToFlattened(curved, [1, 3])).toEqual([0, 13]);
  });

  it('does not swallow the Z closing point into the last edge', () => {
    // bottom de `curved` es el comando 3; el Z (que aplana al punto de
    // cierre etiquetado con el índice del M) no pertenece a ningún edge.
    const flat = flattenPath(curved);
    const [start, end] = commandRangeToFlattened(curved, [3, 4]);
    expect(start).toBe(13);
    expect(end).toBe(14);
    expect(end).toBeLessThan(flat.length - 1); // el punto de cierre queda fuera
  });

  it('parity pin: flattenPathWithSource emits the identical point sequence as flattenPath', () => {
    // La validez de los índices del helper depende de esta invariante.
    for (const outline of [square, curved]) {
      const plain = flattenPath(outline);
      const sourced = flattenPathWithSource(outline);
      expect(sourced.length).toBe(plain.length);
      for (let i = 0; i < plain.length; i++) {
        expect(sourced[i].x).toBeCloseTo(plain[i].x, 10);
        expect(sourced[i].y).toBeCloseTo(plain[i].y, 10);
      }
    }
  });

  it('returns [0,0] for an empty outline', () => {
    expect(commandRangeToFlattened([], [1, 2])).toEqual([0, 0]);
  });

  it('returns [0,0] for a range that emits no points (M only)', () => {
    expect(commandRangeToFlattened(square, [0, 1])).toEqual([0, 0]);
  });

  it('degrades a malformed wrapped range to the single command at start', () => {
    // El productor nunca emite rangos que envuelven; entrada defensiva.
    expect(commandRangeToFlattened(square, [3, 0])).toEqual(
      commandRangeToFlattened(square, [3, 4]),
    );
  });

  it('respects a custom curve resolution', () => {
    expect(commandRangeToFlattened(curved, [2, 3], 4)).toEqual([1, 5]);
  });
});

// ─── resolveEdgePolyline (Fase 5 — dirección en el renderer 2D) ──────────────

describe('resolveEdgePolyline', () => {
  const edges = [
    { name: 'top', segmentRange: [1, 2] as [number, number] },
    { name: 'right', segmentRange: [2, 3] as [number, number] },
  ];

  it('resolves a semantic straight edge to its anchored 2-point polyline', () => {
    const pts = resolveEdgePolyline(square, edges, 'top');
    expect(pts).toHaveLength(2);
    expect(pts[0]).toMatchObject({ x: 0, y: 0 });
    expect(pts[1]).toMatchObject({ x: 10, y: 0 });
  });

  it('expands a semantic curved edge to the full sampled sub-polyline (BP-3 en el renderer)', () => {
    // El bug que tenía SeamRenderer: indexaba segmentRange[0] (espacio de
    // comandos) directo — una curva debe expandir a 13 puntos (1..13).
    const pts = resolveEdgePolyline(curved, [{ name: 'right', segmentRange: [2, 3] }], 'right');
    expect(pts).toHaveLength(13);
    expect(pts[0]).toMatchObject({ x: 10, y: 0 }); // anchor (endpoint del comando 1)
    expect(pts[12].x).toBeCloseTo(10);
    expect(pts[12].y).toBeCloseTo(12);
  });

  it('reversed=true flips traversal order — start becomes what the solver treats as t=0 reversed', () => {
    const fwd = resolveEdgePolyline(square, edges, 'top');
    const rev = resolveEdgePolyline(square, edges, 'top', true);
    expect(rev).toEqual([...fwd].reverse());
  });

  it('falls back to edge-N names as COMMAND indices (the resolveEdgeName producer contract)', () => {
    // 'edge-1' nombra el COMANDO 1 (top) — la misma línea que el productor
    // (snapToEdge camina índices de comando) quiso decir al escribirlo. El
    // pin viejo lo leía como índice aplanado ([flat[1], flat[2]] = right):
    // una arista corrida respecto a lo que el usuario clicó.
    const pts = resolveEdgePolyline(square, undefined, 'edge-1');
    expect(pts).toEqual(resolveEdgePolyline(square, edges, 'top'));
  });

  it('edge-N on a curve resolves identically to its semantic edge (the divergence bug)', () => {
    // Con la lectura aplanada vieja, 'edge-2' sobre `curved` devolvía un
    // micro-segmento de dos muestras dentro de la curva; el solver cosía
    // eso mientras el renderer pintaba otra arista.
    const semantic = resolveEdgePolyline(curved, [{ name: 'right', segmentRange: [2, 3] }], 'right');
    const fallback = resolveEdgePolyline(curved, undefined, 'edge-2');
    expect(fallback).toHaveLength(13);
    expect(fallback).toEqual(semantic);
  });

  it('rejects edge-N with no edge command: edge-0 (the M) and out-of-range N', () => {
    expect(resolveEdgePolyline(square, undefined, 'edge-0')).toEqual([]);
    expect(resolveEdgePolyline(square, undefined, 'edge-99')).toEqual([]);
  });

  it('returns [] for unknown edge names and empty outlines', () => {
    expect(resolveEdgePolyline(square, edges, 'noSuchEdge')).toEqual([]);
    expect(resolveEdgePolyline([], edges, 'top')).toEqual([]);
  });
});
