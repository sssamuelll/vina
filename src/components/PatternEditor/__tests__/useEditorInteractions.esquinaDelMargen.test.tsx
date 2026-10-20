// @vitest-environment jsdom
/**
 * Seleccionar elige la esquina del margen con un clic en su punta (spec
 * 2026-10-02 § 5.2, P3c, la puerta de vuelta). Ahí el clic caía en el vacío y
 * deseleccionaba. Cada caso que dice «como siempre» lleva su control: sin él,
 * un «no pasó nada» pasaría en verde con el montaje roto.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { renderHook, cleanup, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import editorReducer, { selectPiece, toggleSeamAllowance } from '../../../store/editorSlice';
import projectReducer, { restoreState } from '../../../store/projectSlice';
import inputSchemeReducer from '../../../store/inputSchemeSlice';
import simulationReducer, { toggleLayerVisibility } from '../../../store/simulationSlice';
import { useEditorInteractions } from '../useEditorInteractions';
import type { PatternPiece } from '../../../types/types';

afterEach(cleanup);

type Tools = Parameters<typeof useEditorInteractions>[4];

function makeTools(overrides: Record<string, unknown> = {}): Tools {
  const cache: Record<string, Record<string, ReturnType<typeof vi.fn>>> = {};
  return new Proxy({}, {
    get(_t, tool: string) {
      if (tool in overrides) return overrides[tool];
      cache[tool] ??= {};
      return new Proxy(cache[tool], {
        get(bag, method: string) {
          bag[method] ??= vi.fn();
          return bag[method];
        },
      });
    },
  }) as unknown as Tools;
}

const transformInerte = () => ({
  isDragging: false,
  handleMouseDown: vi.fn(() => false),
  handleMouseMove: vi.fn(() => false),
  handleMouseUp: vi.fn(),
  handleKeyDown: vi.fn(),
  getCursor: vi.fn(() => null),
});

/** 100 × 100 en el origen, con margen de 10: la punta de la esquina 0 cae en (−10, −10). */
const pieza = (): PatternPiece => ({
  id: 'a', name: 'a',
  outline: [
    { type: 'M', values: [0, 0] }, { type: 'L', values: [100, 0] }, { type: 'L', values: [100, 100] },
    { type: 'L', values: [0, 100] }, { type: 'Z', values: [] },
  ],
  internals: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false, seamAllowance: 10,
  layer: 1, active: true, createdAt: 0, updatedAt: 0,
} as PatternPiece);

// zoom 1, pan 0: píxel = punto de patrón. Fuera de la pieza, `closest` no da pieza.
function clicFuera(x: number, y: number, button: number) {
  return {
    button, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false,
    clientX: x, clientY: y,
    target: { closest: () => null, ownerSVGElement: null },
    currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0 }) },
  } as unknown as React.MouseEvent<SVGSVGElement>;
}

function setup() {
  const store = configureStore({
    reducer: { editor: editorReducer, project: projectReducer, inputScheme: inputSchemeReducer, simulation: simulationReducer },
  });
  const pieces = [pieza()];
  store.dispatch(restoreState({ ...store.getState().project, pieces }));
  store.dispatch(selectPiece('a'));
  const tools = makeTools({ transformTool: transformInerte() });
  const wrapper = ({ children }: { children: React.ReactNode }) => <Provider store={store}>{children}</Provider>;
  const hook = renderHook(() => useEditorInteractions('select', 1, { x: 0, y: 0 }, pieces, tools), { wrapper });
  return { store, hook };
}

const editor = (store: ReturnType<typeof setup>['store']) => store.getState().editor;

describe('Seleccionar elige la esquina del margen en su punta (P3c)', () => {
  it('control: el vacío lejos de toda pieza deselecciona, como siempre', () => {
    const { store, hook } = setup();
    act(() => { hook.result.current.handleMouseDown(clicFuera(300, 300, 0)); });
    expect(editor(store).selectedPieceIds).toEqual([]);
    expect(editor(store).saSelection).toBeNull();
  });

  it('el clic izquierdo en la punta elige esa esquina', () => {
    const { store, hook } = setup();
    act(() => { hook.result.current.handleMouseDown(clicFuera(-6, -6, 0)); });
    expect(editor(store).saSelection).toEqual({ kind: 'vertex', items: [{ pieceId: 'a', vertexIndex: 0 }] });
    expect(editor(store).selectedPieceIds).toEqual([]);
  });

  it('con el derecho, el mismo sitio deselecciona como siempre', () => {
    const { store, hook } = setup();
    act(() => { hook.result.current.handleMouseDown(clicFuera(-6, -6, 2)); });
    expect(editor(store).saSelection).toBeNull();
    expect(editor(store).selectedPieceIds).toEqual([]);
  });

  it('con Shift, la punta no elige la esquina: Shift suma, no suelta', () => {
    const { store, hook } = setup();
    act(() => { hook.result.current.handleMouseDown({ ...clicFuera(-6, -6, 0), shiftKey: true } as React.MouseEvent<SVGSVGElement>); });
    expect(editor(store).saSelection).toBeNull();
    expect(editor(store).selectedPieceIds).toEqual(['a']);
  });

  it('con el margen oculto, deselecciona como siempre', () => {
    const { store, hook } = setup();
    act(() => { store.dispatch(toggleSeamAllowance()); });
    act(() => { hook.result.current.handleMouseDown(clicFuera(-6, -6, 0)); });
    expect(editor(store).saSelection).toBeNull();
    expect(editor(store).selectedPieceIds).toEqual([]);
  });

  it('con la capa de la pieza oculta, deselecciona como siempre', () => {
    const { store, hook } = setup();
    act(() => { store.dispatch(toggleLayerVisibility(1)); });
    act(() => { hook.result.current.handleMouseDown(clicFuera(-6, -6, 0)); });
    expect(editor(store).saSelection).toBeNull();
  });
});
