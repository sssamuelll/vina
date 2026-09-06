// @vitest-environment jsdom
/**
 * #1136 — Margen escribe en piezas bloqueadas.
 *
 * El candado ya se leía en la pantalla: `sujeto.ts:215` apaga el chip de una
 * pieza bloqueada, y su propio comentario avisa de que colapsar los dos
 * candados en una bandera "prometía escritura sobre una pieza bloqueada".
 * La promesa se cumplió por el otro lado: el chip salía apagado y el gesto
 * escribía igual.
 *
 * Estos tests fijan el candado en el sitio donde se ESCRIBE, no donde se pinta,
 * y con las dos formas del candado: el de la pieza y el de su capa.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { renderHook, cleanup, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import editorReducer from '../../../store/editorSlice';
import { useSeamAllowanceTool } from '../useSeamAllowanceTool';
import { suscribirNoPasoNada } from '../noPasoNada';
import { piezaBloqueada } from '../../../utils/piezaBloqueada';
import type { PatternPiece, SemanticEdge } from '../../../types/types';

afterEach(cleanup);

const square = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [200, 0] },
  { type: 'L', values: [200, 200] },
  { type: 'L', values: [0, 200] },
  { type: 'Z', values: [] },
] as PatternPiece['outline'];

const edges: SemanticEdge[] = [
  { id: 'p:top', name: 'top', segmentRange: [1, 2], edgeType: 'seam' },
  { id: 'p:right', name: 'right', segmentRange: [2, 3], edgeType: 'seam' },
];

function piece(over: Partial<PatternPiece> = {}): PatternPiece {
  return {
    id: 'p', name: 'Square', outline: square, position: { x: 0, y: 0 },
    rotation: 0, mirrored: false, active: true, seamAllowance: 0,
    internals: [], edges, ...over,
  } as unknown as PatternPiece;
}

function setup(pieces: PatternPiece[], layerLocked: Record<number, boolean> = {}) {
  const store = configureStore({ reducer: { editor: editorReducer } });
  const onApply = vi.fn();
  const onApplyAll = vi.fn();
  const onApplySpan = vi.fn();
  const onSelectEdge = vi.fn();
  const onSelectVertex = vi.fn();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  const hook = renderHook(
    () => useSeamAllowanceTool(pieces, 1, { x: 0, y: 0 }, {
      onApply, onApplyAll, onApplySpan, onSelectEdge, onSelectVertex,
    }, true, layerLocked),
    { wrapper },
  );
  return { onApply, onApplyAll, onSelectEdge, onSelectVertex, hook };
}

function clickAt(x: number, y: number) {
  return {
    button: 0, shiftKey: false, clientX: x, clientY: y,
    currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0 }) },
  } as unknown as React.MouseEvent<SVGSVGElement>;
}

describe('#1136 — el candado de la pieza para la escritura, no solo el dibujo', () => {
  it('el clic al cuerpo de una pieza bloqueada no le escribe el margen', () => {
    const { onApply, onApplyAll, hook } = setup([piece({ locked: true })]);
    act(() => hook.result.current.handleMouseDown(clickAt(100, 100)));
    act(() => hook.result.current.handleMouseUp(clickAt(100, 100)));
    expect(onApply).not.toHaveBeenCalled();
    expect(onApplyAll).not.toHaveBeenCalled();
  });

  it('el clic a un borde de una pieza bloqueada no lo selecciona para escribir', () => {
    const { onSelectEdge, hook } = setup([piece({ locked: true })]);
    act(() => hook.result.current.handleMouseDown(clickAt(100, 2)));
    act(() => hook.result.current.handleMouseUp(clickAt(100, 2)));
    expect(onSelectEdge).not.toHaveBeenCalled();
  });

  it('el clic a una esquina de una pieza bloqueada no abre su tipo de esquina', () => {
    const { onSelectVertex, hook } = setup([piece({ locked: true })]);
    act(() => hook.result.current.handleMouseDown(clickAt(2, 2)));
    expect(onSelectVertex).not.toHaveBeenCalled();
  });

  it('la capa bloqueada pesa igual que el candado de la pieza', () => {
    // La pieza NO está bloqueada; su capa sí. `sujeto.ts` ya trataba los dos
    // candados igual para apagar el chip; aquí se iguala para escribir.
    const { onApply, hook } = setup([piece({ layer: 3 })], { 3: true });
    act(() => hook.result.current.handleMouseDown(clickAt(100, 100)));
    act(() => hook.result.current.handleMouseUp(clickAt(100, 100)));
    expect(onApply).not.toHaveBeenCalled();
  });

  it('el gesto bloqueado lo dice, no muere en silencio', () => {
    const avisos: string[] = [];
    const cancelar = suscribirNoPasoNada(a => avisos.push(a.razon));
    const { hook } = setup([piece({ locked: true })]);
    act(() => hook.result.current.handleMouseDown(clickAt(100, 100)));
    cancelar();
    expect(avisos).toContain('margen:pieza-bloqueada');
  });

  it('CONTROL: sin candado, el mismo gesto sí escribe', () => {
    const { onApply, hook } = setup([piece()]);
    act(() => hook.result.current.handleMouseDown(clickAt(100, 100)));
    act(() => hook.result.current.handleMouseUp(clickAt(100, 100)));
    expect(onApply).toHaveBeenCalled();
  });

  // Revisión adversarial 2026-09-06 [ALTO]: la guarda solo miraba el press.
  // El arrastre de "margen a todas" acumula piezas en el mousemove sin volver
  // a consultar el candado, así que rozar una pieza bloqueada con el cuerpo
  // de una suelta se la colaba entera en el `onApplyAll`.
  it('arrastrar el margen desde una pieza suelta no le escribe a la bloqueada que roza (revisión 2026-09-06)', () => {
    const suelta = piece({ id: 'a', position: { x: 0, y: 0 } });
    const bloqueada = piece({ id: 'b', locked: true, position: { x: 300, y: 0 } });
    const { onApplyAll, hook } = setup([suelta, bloqueada]);
    act(() => hook.result.current.handleMouseDown(clickAt(100, 100)));
    act(() => hook.result.current.handleMouseMove(clickAt(150, 100)));
    act(() => hook.result.current.handleMouseMove(clickAt(400, 100)));
    act(() => hook.result.current.handleMouseUp(clickAt(400, 100)));
    expect(onApplyAll).toHaveBeenCalledWith(['a'], expect.any(Number));
  });

  it('el arrastre que rozó una bloqueada también lo dice, no solo la omite', () => {
    const avisos: string[] = [];
    const cancelar = suscribirNoPasoNada(a => avisos.push(a.razon));
    const suelta = piece({ id: 'a', position: { x: 0, y: 0 } });
    const bloqueada = piece({ id: 'b', locked: true, position: { x: 300, y: 0 } });
    const { hook } = setup([suelta, bloqueada]);
    act(() => hook.result.current.handleMouseDown(clickAt(100, 100)));
    act(() => hook.result.current.handleMouseMove(clickAt(150, 100)));
    act(() => hook.result.current.handleMouseMove(clickAt(400, 100)));
    act(() => hook.result.current.handleMouseUp(clickAt(400, 100)));
    cancelar();
    expect(avisos).toContain('margen:pieza-bloqueada');
  });
});

describe('piezaBloqueada — el predicado que faltaba', () => {
  it('el candado de la pieza basta', () => {
    expect(piezaBloqueada(piece({ locked: true }), {})).toBe(true);
  });

  it('el candado de la capa basta', () => {
    expect(piezaBloqueada(piece({ layer: 2 }), { 2: true })).toBe(true);
  });

  it('una pieza sin capa vive en la 1', () => {
    expect(piezaBloqueada(piece(), { 1: true })).toBe(true);
  });

  it('sin ninguno de los dos, no está bloqueada', () => {
    expect(piezaBloqueada(piece({ layer: 2 }), { 3: true })).toBe(false);
  });
});
