/**
 * @vitest-environment jsdom
 *
 * El margen del 3D (spec 2026-10-02 «la interfaz en papel» § 4.3, P5): una
 * columna de tinta pegada al borde derecho de la ventana, con las herramientas
 * del 3D. No flota y no se mueve: va detrás de los paneles, así que un panel se
 * abre entre el escenario y el margen.
 *
 * Guarda también la invariante de alcance que migró del FloatingControls3D
 * borrado: si «Coser» se rompe, coser en 3D deja de tener puerta.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import editorReducer, { setViewMode } from '../../../store/editorSlice';
import simulationReducer, { startSimulation, pauseSimulation } from '../../../store/simulationSlice';
import toolsReducer from '../../../store/toolSlice';
import projectReducer, { addPiece } from '../../../store/projectSlice';
import dockReducer from '../../../store/dockSlice';
import { esTeclaDeBotonera } from '../../../shortcuts/teclaDeBotonera';
import RightDock from '../RightDock';

afterEach(cleanup);

function tienda() {
  return configureStore({
    reducer: { editor: editorReducer, simulation: simulationReducer, tools: toolsReducer, project: projectReducer, dock: dockReducer },
  });
}

function renderRightDock(onOpenPanel = vi.fn()) {
  const store = tienda();
  const vista = render(<Provider store={store}><RightDock onOpenPanel={onOpenPanel} /></Provider>);
  return { store, onOpenPanel, ...vista };
}

describe('RightDock (el margen del 3D)', () => {
  it('Sew activates the 3D sewing tool and toggles back (reachability guard)', () => {
    const { store } = renderRightDock();
    expect(store.getState().tools.activeTool3D).toBe('camera');
    fireEvent.click(screen.getByRole('button', { name: /coser/i }));
    expect(store.getState().tools.activeTool3D).toBe('sew3d');
    expect(store.getState().simulation.simulationState).toBe('idle');
    expect(store.getState().simulation.viewMode3D).toBe('arrange');
    fireEvent.click(screen.getByRole('button', { name: /coser/i }));
    expect(store.getState().tools.activeTool3D).toBe('camera');
  });

  it('Simulate starts the solver', () => {
    const { store } = renderRightDock();
    expect(store.getState().simulation.simulationState).toBe('idle');
    fireEvent.click(screen.getByRole('button', { name: /simular/i }));
    expect(store.getState().simulation.simulationState).not.toBe('idle');
  });

  it('Arrange sets the 3D view mode to arrange', () => {
    const { store } = renderRightDock();
    fireEvent.click(screen.getByRole('button', { name: /colocar/i }));
    expect(store.getState().simulation.viewMode3D).toBe('arrange');
  });

  it('Avatar opens the Avatar panel', () => {
    const { onOpenPanel } = renderRightDock();
    fireEvent.click(screen.getByRole('button', { name: 'Avatar' }));
    expect(onOpenPanel).toHaveBeenCalledWith('Avatar');
  });

  it('is hidden in 2D-only view', () => {
    const store = tienda();
    store.dispatch(setViewMode('2d'));
    render(<Provider store={store}><RightDock onOpenPanel={vi.fn()} /></Provider>);
    expect(screen.queryByRole('navigation', { name: 'Herramientas del 3D' })).toBeNull();
  });

  it('sin zona AUTO: simulada, no aparece la sugerencia de BOM (spec 2026-10-02 § 8)', () => {
    const { store } = renderRightDock();
    act(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      store.dispatch(addPiece({ id: 'p1', name: 'P', outline: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false, seamAllowance: 10, internals: [], createdAt: 0, updatedAt: 0, active: false } as any));
      store.dispatch(startSimulation());
      store.dispatch(pauseSimulation()); // → simulationState 'paused' → stage 'simulated'
    });
    expect(screen.queryByRole('button', { name: 'BOM' })).toBeNull();
    expect(screen.queryByText('auto')).toBeNull();
  });
});

describe('el margen del 3D es un margen (P5)', () => {
  it('es una columna llamada «Herramientas del 3D», en papel, con los cuatro botones', () => {
    renderRightDock();
    const margen = screen.getByRole('navigation', { name: 'Herramientas del 3D' });
    expect(margen.classList.contains('margen')).toBe(true);
    expect(margen.classList.contains('margen--derecho')).toBe(true);
    expect(margen.getAttribute('data-material')).toBe('papel');
    expect(margen.getAttribute('data-superficie')).toBe('ambiente');
    expect(margen.getAttribute('data-shortcut-context')).toBe('3d');
    const nombres = Array.from(margen.querySelectorAll('button')).map((b) => b.getAttribute('aria-label'));
    expect(nombres).toEqual(['Colocar', 'Coser', 'Simular', 'Avatar']);
  });

  it('no tiene rótulo «3D» (§ 4.3: no hay rótulo 2D ni 3D) ni flota como un dock', () => {
    const { container } = renderRightDock();
    expect(container.querySelector('.dock__label')).toBeNull();
    expect(container.querySelector('.dock')).toBeNull();
    expect(screen.queryByText('3D')).toBeNull();
  });

  it('el estado de la simulación ya no es un «SIMULANDO» flotante del margen: baja a la línea al pie', () => {
    const { store } = renderRightDock();
    act(() => { store.dispatch(startSimulation()); });
    expect(screen.queryByText(/SIMULANDO/)).toBeNull();
    // Simular, corriendo, se ve apretado y ofrece pausar.
    expect(screen.getByRole('button', { name: 'Simular' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('es una botonera: Espacio sobre uno de sus botones no llega a los atajos', () => {
    // «Simular» tiene Espacio como atajo. Con el foco en «Colocar», Espacio
    // pulsa el botón; no debe además arrancar la simulación (contrato § 4).
    renderRightDock();
    const visto: boolean[] = [];
    const oyente = (e: KeyboardEvent) => visto.push(esTeclaDeBotonera(e));
    document.addEventListener('keydown', oyente);
    try {
      fireEvent.keyDown(screen.getByRole('button', { name: 'Colocar' }), { key: ' ' });
    } finally {
      document.removeEventListener('keydown', oyente);
    }
    expect(visto).toEqual([true]);
  });

  it('un clic de ratón no deja el foco en el botón', () => {
    renderRightDock();
    const boton = screen.getByRole('button', { name: 'Colocar' });
    // `mousedown` cancelado = el navegador no mueve el foco al botón.
    expect(fireEvent.mouseDown(boton)).toBe(false);
  });

  it('un mousedown sobre el aire de la columna no se cancela: solo los botones', () => {
    renderRightDock();
    const margen = screen.getByRole('navigation', { name: 'Herramientas del 3D' });
    expect(fireEvent.mouseDown(margen)).toBe(true);
  });
});
