// @vitest-environment jsdom
/**
 * Spec 2026-09-02 (tanda 5b-3, #1100): el margen se lee al pasar el ratón por
 * el borde y se escribe al clicar. La prueba cruza hit-test, sujeto, capa de
 * chips y store: un chip aislado no demostraría que el borde bajo el ratón
 * llega al lienzo ni que Enter escribe en ESE borde.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';
import constructionReducer from '../../../store/constructionSlice';
import editorReducer, { clearSelection, setActiveTool } from '../../../store/editorSlice';
import inputSchemeReducer from '../../../store/inputSchemeSlice';
import projectReducer, { restoreState } from '../../../store/projectSlice';
import simulationReducer from '../../../store/simulationSlice';
import toolReducer, { setActiveTool2D } from '../../../store/toolSlice';
import workflowReducer from '../../../store/workflowSlice';
import type { PatternPiece } from '../../../types/types';
import PatternEditor from '../PatternEditor';

afterEach(cleanup);

const pieza = (over: Partial<PatternPiece> = {}): PatternPiece => ({
  id: 'p',
  name: 'Delantero',
  outline: [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [100, 0] },
    { type: 'L', values: [100, 100] },
    { type: 'L', values: [0, 100] },
    { type: 'Z', values: [] },
  ],
  edges: [
    { id: 'p:top', name: 'top', segmentRange: [1, 2], edgeType: 'seam', length: 100 },
    { id: 'p:right', name: 'right', segmentRange: [2, 3], edgeType: 'seam', length: 100 },
  ],
  internals: [],
  position: { x: 0, y: 0 },
  rotation: 0,
  mirrored: false,
  seamAllowance: 10,
  active: true,
  createdAt: 0,
  updatedAt: 0,
  ...over,
});

function setup(p: PatternPiece = pieza()) {
  const store = configureStore({
    reducer: {
      project: projectReducer,
      editor: editorReducer,
      tools: toolReducer,
      simulation: simulationReducer,
      construction: constructionReducer,
      inputScheme: inputSchemeReducer,
      workflow: workflowReducer,
    },
    middleware: getDefault => getDefault({ serializableCheck: false }),
  });
  store.dispatch(restoreState({ ...store.getState().project, pieces: [p] }));
  store.dispatch(setActiveTool('seamAllowance'));
  store.dispatch(setActiveTool2D('seamAllowance'));
  const onOpenPanel = vi.fn();
  const view = render(
    <Provider store={store}>
      <PatternEditor onOpenPanel={onOpenPanel} />
    </Provider>,
  );
  const svg = view.container.querySelector<SVGSVGElement>('svg.pattern-svg')!;
  const lectura = () => view.container.querySelector<HTMLElement>('.cota--lectura');
  const boton = () => view.container.querySelector<HTMLButtonElement>('button.cota');
  const input = () => view.container.querySelector<HTMLInputElement>('input.cota--editando');
  const borde = (id: string) => store.getState().project.pieces[0].edges!.find(e => e.id === id)!;
  return { store, view, svg, onOpenPanel, lectura, boton, input, borde };
}

// zoom 1, pan 0, rect en el origen (jsdom): píxel = punto de patrón.
const clic = (svg: SVGSVGElement, x: number, y: number) => {
  fireEvent.mouseDown(svg, { button: 0, buttons: 1, clientX: x, clientY: y });
  fireEvent.mouseUp(svg, { button: 0, buttons: 0, clientX: x, clientY: y });
};

describe('PatternEditor — el margen se lee al pasar (María 30-08 [25:44])', () => {
  it('sobre el borde aparece la lectura con el número de la pieza y "de la pieza"; al quitar el ratón se va', () => {
    const { svg, lectura, boton } = setup();
    fireEvent.mouseMove(svg, { clientX: 50, clientY: 2 });
    expect(lectura()?.textContent).toBe('10 mm');
    expect(lectura()?.getAttribute('data-rotulo')).toBe('de la pieza');
    expect(lectura()?.classList.contains('cota--hueca')).toBe(true);
    expect(boton()).toBeNull();
    fireEvent.mouseMove(svg, { clientX: 50, clientY: 50 });
    expect(lectura()).toBeNull();
  });

  it('el puntero sale del <svg> (a la tira, fuera de la ventana): la lectura se va (#1132, un suscriptor)', () => {
    const { svg, lectura } = setup();
    fireEvent.mouseMove(svg, { clientX: 50, clientY: 2 });
    expect(lectura()).not.toBeNull();
    fireEvent.mouseLeave(svg);
    expect(lectura()).toBeNull();
  });

  it('el resalte del borde bajo el ratón se pinta más fino que el de la selección', () => {
    const { svg, view } = setup();
    fireEvent.mouseMove(svg, { clientX: 50, clientY: 2 });
    const hover = view.container.querySelector('[data-testid="sa-edge-hover"]');
    expect(hover).not.toBeNull();
    expect(view.container.querySelector('[data-testid="sa-edge-highlight"]')).toBeNull();
  });

  it('pieza bloqueada: la lectura sale apagada y el clic no abre edición', () => {
    const { svg, lectura, input } = setup(pieza({ locked: true }));
    fireEvent.mouseMove(svg, { clientX: 50, clientY: 2 });
    expect(lectura()?.getAttribute('aria-disabled')).toBe('true');
    clic(svg, 50, 2);
    expect(input()).toBeNull();
  });
});

describe('PatternEditor — el margen se escribe al clicar (#1100)', () => {
  it('clic en el borde: el chip se ancla ABIERTO con el foco; Enter escribe en ese borde y lo promueve a propio', () => {
    const { store, svg, input, boton, borde, onOpenPanel } = setup();
    clic(svg, 50, 2);
    expect(store.getState().editor.saSelection).toEqual({ kind: 'edge', items: [{ pieceId: 'p', edgeId: 'p:top' }] });
    // El panel ya no se abre solo al clicar un borde (spec § 6): abrirlo empujaba
    // el lienzo y dejaba el chip recién abierto bajo la tira.
    expect(onOpenPanel).not.toHaveBeenCalled();
    const campo = input()!;
    expect(campo).not.toBeNull();
    expect(document.activeElement).toBe(campo);
    expect(campo.value).toBe('10');
    expect(campo.getAttribute('data-rotulo')).toBe('de la pieza');

    fireEvent.change(campo, { target: { value: '20' } });
    fireEvent.keyDown(campo, { key: 'Enter' });

    expect(borde('p:top').seamAllowanceWidth).toBe(20);
    expect(borde('p:right').seamAllowanceWidth).toBeUndefined();
    expect(store.getState().project.pieces[0].seamAllowance).toBe(10);
    const chip = boton()!;
    expect(chip.textContent).toBe('20 mm');
    expect(chip.classList.contains('cota--hueca')).toBe(false);
    expect(chip.hasAttribute('data-rotulo')).toBe(false);
    expect(document.activeElement).toBe(chip);
  });

  it('el arrastre escribe un tramo y deja el chip anclado en REPOSO leyendo el tramo (R3: el arrastre no abre edición)', () => {
    const { svg, input, boton, borde } = setup();
    fireEvent.mouseDown(svg, { button: 0, buttons: 1, clientX: 20, clientY: 2 });
    fireEvent.mouseMove(svg, { button: 0, buttons: 1, clientX: 80, clientY: 2 });
    fireEvent.mouseUp(svg, { button: 0, buttons: 0, clientX: 80, clientY: 2 });
    expect(borde('p:top').seamAllowanceSpans).toEqual([{ tStart: 0.2, tEnd: 0.8, width: 9.5 }]);
    expect(input()).toBeNull();
    const chip = boton()!;
    expect(chip.textContent).toBe('9,5 mm');
    expect(chip.getAttribute('data-rotulo')).toBe('del tramo');
    expect(chip.classList.contains('cota--hueca')).toBe(false);
  });

  it('escribir sobre "del tramo" escribe SOLO ese tramo, no el borde', () => {
    const { svg, input, borde } = setup(pieza({
      edges: [{ id: 'p:top', name: 'top', segmentRange: [1, 2], edgeType: 'seam', length: 100, seamAllowanceSpans: [{ tStart: 0.4, tEnd: 0.6, width: 7 }] }],
    }));
    clic(svg, 50, 2);
    const campo = input()!;
    expect(campo.value).toBe('7');
    fireEvent.change(campo, { target: { value: '12' } });
    fireEvent.keyDown(campo, { key: 'Enter' });
    expect(borde('p:top').seamAllowanceSpans).toEqual([{ tStart: 0.4, tEnd: 0.6, width: 12 }]);
    expect(borde('p:top').seamAllowanceWidth).toBeUndefined();
  });

  it('Escape descarta el borrador y deja el chip en reposo; al deseleccionar, el chip se va', () => {
    const { store, svg, input, boton, borde } = setup();
    clic(svg, 50, 2);
    const campo = input()!;
    fireEvent.change(campo, { target: { value: '99' } });
    fireEvent.keyDown(campo, { key: 'Escape' });
    expect(borde('p:top').seamAllowanceWidth).toBeUndefined();
    expect(boton()?.textContent).toBe('10 mm');
    act(() => { store.dispatch(clearSelection()); });
    expect(boton()).toBeNull();
  });

  it('con el chip anclado, pasar por el MISMO borde no duplica el número; pasar por otro borde sí lee', () => {
    const { svg, input, lectura, boton } = setup();
    clic(svg, 50, 2);
    fireEvent.keyDown(input()!, { key: 'Escape' });
    fireEvent.mouseMove(svg, { clientX: 70, clientY: 2 });
    expect(boton()).not.toBeNull();
    expect(lectura()).toBeNull();
    fireEvent.mouseMove(svg, { clientX: 98, clientY: 50 });
    expect(lectura()?.textContent).toBe('10 mm');
    expect(boton()).not.toBeNull();
  });

  it('Shift+clic en un segundo borde: dos seleccionados, cero chips anclados (manda el panel)', () => {
    const { store, svg, boton, input } = setup();
    clic(svg, 50, 2);
    fireEvent.keyDown(input()!, { key: 'Escape' });
    fireEvent.mouseDown(svg, { button: 0, buttons: 1, clientX: 98, clientY: 50, shiftKey: true });
    fireEvent.mouseUp(svg, { button: 0, buttons: 0, clientX: 98, clientY: 50, shiftKey: true });
    expect(store.getState().editor.saSelection?.items).toHaveLength(2);
    expect(boton()).toBeNull();
  });

  it('la pieza desaparece debajo (undo): sin chip, sin crash', () => {
    const { store, svg, boton } = setup();
    clic(svg, 50, 2);
    act(() => { store.dispatch(restoreState({ ...store.getState().project, pieces: [] })); });
    expect(boton()).toBeNull();
  });
});

describe('PatternEditor — la esquina con Margen trae su etiqueta, y no abre Propiedades (P3c)', () => {
  it('clic en la esquina: la elige, su etiqueta dice el tipo, y Propiedades no se abre', () => {
    const { store, svg, onOpenPanel } = setup();
    clic(svg, 0, 0);
    expect(store.getState().editor.saSelection).toEqual({ kind: 'vertex', items: [{ pieceId: 'p', vertexIndex: 0 }] });
    // Abría el panel por su cuenta: «su tipo no tiene otra puerta». Ahora la tiene.
    expect(onOpenPanel).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Tipo de esquina: Inglete' })).toBeTruthy();
  });

  it('elegir «Cuadrada» en su menú escribe esa esquina y nada más', () => {
    const { store, svg } = setup();
    clic(svg, 0, 0);
    fireEvent.click(screen.getByRole('button', { name: 'Tipo de esquina: Inglete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cuadrada' }));
    const p = store.getState().project.pieces[0];
    expect(p.cornerTypes).toEqual({ 0: 'squared' });
    expect(p.defaultCornerType).toBeUndefined();
    expect(screen.getByRole('button', { name: 'Tipo de esquina: Cuadrada' })).toBeTruthy();
  });
});
