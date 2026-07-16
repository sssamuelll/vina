/**
 * @vitest-environment jsdom
 *
 * Guards the 3D dock — including the sewing-reachability invariant migrated
 * from the deleted FloatingControls3D test (if Sew breaks, 3D sewing is
 * unreachable).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import editorReducer, { setViewMode } from '../../../store/editorSlice';
import simulationReducer, { startSimulation, pauseSimulation, setFrameTime } from '../../../store/simulationSlice';
import toolsReducer from '../../../store/toolSlice';
import projectReducer, { addPiece } from '../../../store/projectSlice';
import dockReducer, { toggleDockSignaling } from '../../../store/dockSlice';
import RightDock from '../RightDock';

afterEach(cleanup);

function renderRightDock(onOpenPanel = vi.fn()) {
  const store = configureStore({
    reducer: { editor: editorReducer, simulation: simulationReducer, tools: toolsReducer, project: projectReducer, dock: dockReducer },
  });
  render(<Provider store={store}><RightDock onOpenPanel={onOpenPanel} /></Provider>);
  return { store, onOpenPanel };
}

describe('RightDock (3D dock)', () => {
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
    fireEvent.click(screen.getByRole('button', { name: /avatar/i }));
    expect(onOpenPanel).toHaveBeenCalledWith('Avatar');
  });

  it('is hidden in 2D-only view', () => {
    const store = configureStore({
      reducer: { editor: editorReducer, simulation: simulationReducer, tools: toolsReducer, project: projectReducer, dock: dockReducer },
    });
    store.dispatch(setViewMode('2d'));
    render(<Provider store={store}><RightDock onOpenPanel={vi.fn()} /></Provider>);
    expect(screen.queryByText('3D')).toBeNull();
  });

  it('shows a BOM ✦ suggestion at the simulated stage and runs it', () => {
    const { store, onOpenPanel } = renderRightDock();
    act(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      store.dispatch(addPiece({ id: 'p1', name: 'P', outline: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false, seamAllowance: 10, internals: [], createdAt: 0, updatedAt: 0, active: false } as any));
      store.dispatch(startSimulation());
      store.dispatch(pauseSimulation()); // → simulationState 'paused' → stage 'simulated'
    });
    fireEvent.click(screen.getByRole('button', { name: 'BOM' }));
    expect(onOpenPanel).toHaveBeenCalledWith('BOM');
  });

  it('keeps a BOM suggestion at the simulated stage', () => {
    const { store } = renderRightDock();
    act(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      store.dispatch(addPiece({ id: 'p1', name: 'P', outline: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false, seamAllowance: 10, internals: [], createdAt: 0, updatedAt: 0, active: false } as any));
      store.dispatch(startSimulation());
      store.dispatch(pauseSimulation());
    });
    fireEvent.click(screen.getByRole('button', { name: 'Fijar BOM' }));
    expect(store.getState().dock.pinnedExtra.right).toEqual(['bom']);
    expect(screen.getByRole('button', { name: 'Soltar BOM' })).toBeTruthy();
  });

  it('signaling=off mutes the auto layer at the simulated stage', () => {
    const { store } = renderRightDock();
    act(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      store.dispatch(addPiece({ id: 'p1', name: 'P', outline: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false, seamAllowance: 10, internals: [], createdAt: 0, updatedAt: 0, active: false } as any));
      store.dispatch(startSimulation());
      store.dispatch(pauseSimulation()); // → simulationState 'paused' → stage 'simulated'
      store.dispatch(toggleDockSignaling()); // → 'off'
    });
    expect(screen.queryByText('auto')).toBeNull();
    expect(screen.queryByRole('button', { name: 'BOM' })).toBeNull();
  });
});

describe('SIMULATING badge (Fase1-S4)', () => {
  it('omits the fps figure until the first real frame arrives', () => {
    // "SIMULANDO · 0fps" en los primeros segundos del drape lee como crash
    // (Jordan cierra la pestaña ahí — assessment Nielsen P0).
    const { store } = renderRightDock();
    act(() => { store.dispatch(startSimulation()); });
    const badge = screen.getByText(/SIMULANDO/);
    expect(badge.textContent).not.toMatch(/0fps/);
    act(() => { store.dispatch(setFrameTime(33.3)); });
    expect(screen.getByText(/SIMULANDO · 30fps/)).toBeTruthy();
  });
});
