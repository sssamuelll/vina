// @vitest-environment jsdom
/**
 * El elástico era una herramienta de solo-crear.
 *
 * Se podía poner en un borde y después no había forma de quitarlo salvo Ctrl+Z
 * o pedírselo al copiloto. El resalte del seleccionado tampoco se encendía
 * nunca: `ElasticRenderer.tsx:261` leía `editor.selectedElasticId`, un campo de
 * Redux con CERO escritores en todo `src/`. La selección de verdad vivía —y
 * vive— en el estado local de `useElasticTool`, que sí se escribe en cada clic.
 *
 * Por eso la herramienta se quedó sin puerta el 05-09: darle botón habría sido
 * enseñarle a María a crear algo que no puede deshacer.
 *
 * Aquí se cierran las dos mitades: el campo muerto de Redux desaparece (el
 * resalte pasa a colgar del local, que es el que sabe) y Supr borra el
 * seleccionado. Con eso la herramienta ya se puede usar entera y merece puerta.
 */
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createElement } from 'react';
import type React from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import projectReducer from '../../store/projectSlice';
import editorReducer from '../../store/editorSlice';
import { useElasticTool } from '../useElasticTool';
import type { PatternPiece, SemanticEdge } from '../../types/types';

const BORDES: SemanticEdge[] = [
  { id: 'e-top', name: 'topEdge', segmentRange: [1, 2], edgeType: 'seam' },
  { id: 'e-right', name: 'rightEdge', segmentRange: [2, 3], edgeType: 'seam' },
  { id: 'e-bottom', name: 'bottomEdge', segmentRange: [3, 4], edgeType: 'seam' },
  { id: 'e-left', name: 'leftEdge', segmentRange: [0, 1], edgeType: 'seam' },
];

const PIEZA = {
  id: 'p1', name: 'Delantero',
  outline: [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [200, 0] },
    { type: 'L', values: [200, 150] },
    { type: 'L', values: [0, 150] },
    { type: 'Z', values: [] },
  ],
  internals: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false,
  seamAllowance: 10, layer: 1, sublayer: 0, active: true, edges: BORDES,
  createdAt: 0, updatedAt: 0,
} as unknown as PatternPiece;

function montar() {
  const store = configureStore({
    reducer: { project: projectReducer, editor: editorReducer },
    preloadedState: {
      project: { ...projectReducer(undefined, { type: '@@init' }), pieces: [PIEZA] },
      editor: { ...editorReducer(undefined, { type: '@@init' }), activeTool: 'elastic' as const },
    },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    createElement(Provider, { store, children });
  const hook = renderHook(() => useElasticTool(1, { x: 0, y: 0 }, [PIEZA]), { wrapper });
  return { store, hook };
}

/** Un clic sintético sobre el lienzo, en coordenadas de patrón (zoom 1, pan 0). */
function clicEn(x: number, y: number) {
  return {
    button: 0,
    clientX: x,
    clientY: y,
    currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) },
  } as unknown as React.MouseEvent<SVGSVGElement>;
}

function tecla(key: string) {
  return new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
}

describe('el elástico se selecciona y se borra', () => {
  it('Redux ya no lleva `selectedElasticId`: nadie lo escribía', () => {
    const editor = editorReducer(undefined, { type: '@@init' }) as unknown as Record<string, unknown>;
    expect(
      'selectedElasticId' in editor,
      'el campo volvió a Redux; si tiene escritores ahora, quita este test y cuéntalo',
    ).toBe(false);
  });

  it('clicar un borde crea el elástico y lo deja seleccionado en el local', () => {
    const { store, hook } = montar();
    act(() => { hook.result.current.handleMouseDown(clicEn(100, 0)); });
    const elasticos = store.getState().project.elastics;
    expect(elasticos).toHaveLength(1);
    expect(hook.result.current.selectedElasticId).toBe(elasticos[0].id);
  });

  it('el lado de CIERRE también acepta elástico: es un borde como los otros', () => {
    // El hit-test recorre los comandos y para el lado izquierdo devuelve el
    // índice de la `Z` (4). Ningún `SemanticEdge` declara ese índice — el
    // productor etiqueta el tramo de cierre con el de la `M` (0) —, así que
    // `resolveEdgeName` caía a `edge-4`, `addElastic` no encontraba ese nombre
    // y se iba en silencio. Un lado entero de cualquier pieza, mudo.
    const { store, hook } = montar();
    act(() => { hook.result.current.handleMouseDown(clicEn(0, 75)); });
    const elasticos = store.getState().project.elastics;
    expect(elasticos, 'el lado de cierre no acepta elástico').toHaveLength(1);
    expect(elasticos[0].edgeName).toBe('leftEdge');
  });

  it('Supr borra el elástico seleccionado y suelta la selección', () => {
    const { store, hook } = montar();
    act(() => { hook.result.current.handleMouseDown(clicEn(100, 0)); });
    expect(store.getState().project.elastics).toHaveLength(1);

    act(() => { hook.result.current.handleKeyDown(tecla('Delete')); });

    expect(store.getState().project.elastics, 'Supr no borró el elástico').toHaveLength(0);
    expect(hook.result.current.selectedElasticId, 'quedó seleccionado un elástico que ya no existe').toBeNull();
  });

  it('Retroceso hace lo mismo que Supr', () => {
    const { store, hook } = montar();
    act(() => { hook.result.current.handleMouseDown(clicEn(100, 0)); });
    act(() => { hook.result.current.handleKeyDown(tecla('Backspace')); });
    expect(store.getState().project.elastics).toHaveLength(0);
  });

  it('sin nada seleccionado NO consume: el Supr es de otro', () => {
    // Si devolviera `true` en vacío, `routeKey` pararía el evento y María no
    // podría borrar una pieza con el Elástico activo.
    const { hook } = montar();
    let consumio = true;
    act(() => { consumio = hook.result.current.handleKeyDown(tecla('Delete')); });
    expect(consumio, 'se quedó el Supr sin tener sujeto').toBe(false);
  });

  it('con un elástico seleccionado SÍ consume, y lo dice', () => {
    const { hook } = montar();
    act(() => { hook.result.current.handleMouseDown(clicEn(100, 0)); });
    let consumio = false;
    act(() => { consumio = hook.result.current.handleKeyDown(tecla('Delete')); });
    expect(consumio).toBe(true);
  });

  it('Escape suelta la selección sin borrar nada', () => {
    const { store, hook } = montar();
    act(() => { hook.result.current.handleMouseDown(clicEn(100, 0)); });
    act(() => { hook.result.current.handleKeyDown(tecla('Escape')); });
    expect(store.getState().project.elastics, 'Escape borró, y solo tenía que soltar').toHaveLength(1);
    expect(hook.result.current.selectedElasticId).toBeNull();
  });
});
