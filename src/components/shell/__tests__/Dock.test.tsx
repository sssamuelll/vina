/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import Dock from '../Dock';
import { MousePointer2, Pen } from 'lucide-react';
import editorReducer, { setViewMode } from '../../../store/editorSlice';
import toolsReducer from '../../../store/toolSlice';
import projectReducer, { addPiece } from '../../../store/projectSlice';
import simulationReducer from '../../../store/simulationSlice';
import dockReducer, { toggleDockSignaling, pinAuto } from '../../../store/dockSlice';
import LeftDock from '../LeftDock';

afterEach(cleanup);

const TOOLS = [
  { id: 'select', icon: MousePointer2, label: 'Select', shortcut: 'Z' },
  { id: 'pen', icon: Pen, label: 'Pen', shortcut: 'H' },
];

describe('Dock (presentational)', () => {
  it('renders the domain label and one button per tool', () => {
    render(<Dock domainLabel="2D" tools={TOOLS} activeToolId="select" onSelectTool={() => {}} />);
    expect(screen.getByText('2D')).toBeTruthy();
    expect(screen.getByRole('button', { name: /select · z/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /pen · h/i })).toBeTruthy();
  });

  it('calls onSelectTool with the tool id on click', () => {
    const onSelectTool = vi.fn();
    render(<Dock domainLabel="2D" tools={TOOLS} activeToolId="select" onSelectTool={onSelectTool} />);
    fireEvent.click(screen.getByRole('button', { name: /pen · h/i }));
    expect(onSelectTool).toHaveBeenCalledWith('pen');
  });

  it('marks the active tool', () => {
    render(<Dock domainLabel="2D" tools={TOOLS} activeToolId="pen" onSelectTool={() => {}} />);
    const penBtn = screen.getByRole('button', { name: /pen · h/i });
    expect(penBtn.className).toContain('dock__tool--active');
  });
});

function renderLeftDock(onOpenPanel = vi.fn()) {
  const store = configureStore({
    reducer: { editor: editorReducer, tools: toolsReducer, project: projectReducer, simulation: simulationReducer, dock: dockReducer },
  });
  render(<Provider store={store}><LeftDock onOpenPanel={onOpenPanel} /></Provider>);
  return { store, onOpenPanel };
}

describe('LeftDock (container)', () => {
  it('activates a tool in BOTH slices on click (convergence guard)', () => {
    const { store } = renderLeftDock();
    fireEvent.click(screen.getByRole('button', { name: /sew · b/i }));
    expect(store.getState().editor.activeTool).toBe('seam');
    expect(store.getState().tools.activeTool2D).toBe('seam');
  });

  it('is hidden in 3D-only view', () => {
    const store = configureStore({ reducer: { editor: editorReducer, tools: toolsReducer, project: projectReducer, simulation: simulationReducer, dock: dockReducer } });
    store.dispatch(setViewMode('3d'));
    render(<Provider store={store}><LeftDock onOpenPanel={vi.fn()} /></Provider>);
    expect(screen.queryByText('2D')).toBeNull();
  });

  it('shows a grade ✦ suggestion once pieces exist and runs it', () => {
    const { store, onOpenPanel } = renderLeftDock();
    act(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      store.dispatch(addPiece({ id: 'p1', name: 'P', outline: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false, seamAllowance: 10, internals: [], createdAt: 0, updatedAt: 0, active: false } as any));
    });
    fireEvent.click(screen.getByRole('button', { name: 'Grade' }));
    expect(onOpenPanel).toHaveBeenCalledWith('Grading');
  });

  it('keeps a grade suggestion (✦→📌) and records it in the dock slice', () => {
    const { store } = renderLeftDock();
    act(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      store.dispatch(addPiece({ id: 'p1', name: 'P', outline: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false, seamAllowance: 10, internals: [], createdAt: 0, updatedAt: 0, active: false } as any));
    });
    fireEvent.click(screen.getByRole('button', { name: 'Keep Grade' }));
    expect(store.getState().dock.pinnedExtra.left).toEqual(['grade']);
    expect(screen.getByRole('button', { name: 'Unpin Grade' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Keep Grade' })).toBeNull();
  });

  it('signaling=off mutes the auto layer but shows no suggestion', () => {
    const { store } = renderLeftDock();
    act(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      store.dispatch(addPiece({ id: 'p1', name: 'P', outline: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false, seamAllowance: 10, internals: [], createdAt: 0, updatedAt: 0, active: false } as any));
      store.dispatch(toggleDockSignaling()); // → 'off'
    });
    expect(screen.queryByText('auto')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Keep Grade' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Grade' })).toBeNull();
  });

  it('off: a kept tool still renders (plain, no Unpin badge)', () => {
    const { store } = renderLeftDock();
    act(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      store.dispatch(addPiece({ id: 'p1', name: 'P', outline: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false, seamAllowance: 10, internals: [], createdAt: 0, updatedAt: 0, active: false } as any));
      store.dispatch(pinAuto({ side: 'left', id: 'grade' }));
      store.dispatch(toggleDockSignaling()); // → 'off'
    });
    expect(screen.getByRole('button', { name: 'Grade' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Unpin Grade' })).toBeNull();
  });
});
