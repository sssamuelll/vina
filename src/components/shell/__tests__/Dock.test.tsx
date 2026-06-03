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
import dockReducer, { toggleDockSignaling, pinAuto, addDockTool, removeDockTool, reorderDockTool } from '../../../store/dockSlice';
import LeftDock from '../LeftDock';

afterEach(cleanup);

function makeDataTransfer() {
  const data: Record<string, string> = {};
  return {
    effectAllowed: '',
    dropEffect: '',
    setData(k: string, v: string) { data[k] = v; },
    getData(k: string) { return data[k] ?? ''; },
  };
}

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

  it('reorders on drop: dragging Select onto Pen calls onReorderTool(select, pen)', () => {
    const onReorderTool = vi.fn();
    render(<Dock domainLabel="2D" tools={TOOLS} activeToolId="select" onSelectTool={() => {}} onReorderTool={onReorderTool} />);
    const dt = makeDataTransfer();
    fireEvent.dragStart(screen.getByRole('button', { name: /select · z/i }), { dataTransfer: dt });
    fireEvent.dragOver(screen.getByRole('button', { name: /pen · h/i }), { dataTransfer: dt });
    fireEvent.drop(screen.getByRole('button', { name: /pen · h/i }), { dataTransfer: dt });
    expect(onReorderTool).toHaveBeenCalledWith('select', 'pen');
  });

  it('a drop onto the same tool does not reorder', () => {
    const onReorderTool = vi.fn();
    render(<Dock domainLabel="2D" tools={TOOLS} activeToolId="select" onSelectTool={() => {}} onReorderTool={onReorderTool} />);
    const dt = makeDataTransfer();
    const sel = screen.getByRole('button', { name: /select · z/i });
    fireEvent.dragStart(sel, { dataTransfer: dt });
    fireEvent.drop(sel, { dataTransfer: dt });
    expect(onReorderTool).not.toHaveBeenCalled();
  });

  it('tool buttons are not draggable without onReorderTool', () => {
    render(<Dock domainLabel="2D" tools={TOOLS} activeToolId="select" onSelectTool={() => {}} />);
    expect((screen.getByRole('button', { name: /select · z/i }) as HTMLButtonElement).draggable).toBe(false);
  });

  it('clicking a tool still activates it while reorder is enabled', () => {
    const onSelectTool = vi.fn();
    render(<Dock domainLabel="2D" tools={TOOLS} activeToolId="select" onSelectTool={onSelectTool} onReorderTool={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /pen · h/i }));
    expect(onSelectTool).toHaveBeenCalledWith('pen');
  });

  it('keeps the accessible name and shows a right-positioned tooltip on hover', () => {
    vi.useFakeTimers();
    const { container } = render(<Dock domainLabel="2D" tools={TOOLS} activeToolId="select" onSelectTool={() => {}} />);
    expect(screen.getByRole('button', { name: /select · z/i })).toBeTruthy();
    fireEvent.mouseEnter(container.querySelectorAll('.tool-tooltip-wrapper')[0]);
    act(() => { vi.advanceTimersByTime(500); });
    const tip = document.querySelector('.tool-tooltip');
    expect(tip).toBeTruthy();
    expect(tip!.classList.contains('tooltip-right')).toBe(true);
    expect(tip!.querySelector('.tool-tooltip-name')!.textContent).toBe('Select');
    vi.useRealTimers();
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

  it('adds a catalog tool to the dock when dispatched', () => {
    const { store } = renderLeftDock();
    expect(screen.queryByRole('button', { name: /notch/i })).toBeNull();
    act(() => { store.dispatch(addDockTool('notch')); });
    expect(screen.getByRole('button', { name: /notch/i })).toBeTruthy();
  });

  it('removes a default tool from the dock when dispatched', () => {
    const { store } = renderLeftDock();
    expect(screen.getByRole('button', { name: /pen · h/i })).toBeTruthy();
    act(() => { store.dispatch(removeDockTool('pen')); });
    expect(screen.queryByRole('button', { name: /pen · h/i })).toBeNull();
  });

  it('the ＋ button toggles the picker and Escape closes it', () => {
    renderLeftDock();
    const add = screen.getByRole('button', { name: 'Customize dock tools' });
    expect(screen.queryByRole('group', { name: 'Customize dock tools' })).toBeNull();
    fireEvent.click(add);
    expect(screen.getByRole('group', { name: 'Customize dock tools' })).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('group', { name: 'Customize dock tools' })).toBeNull();
  });

  it('renders tools in tools2d order; reordering moves the tool in the DOM', () => {
    const { store } = renderLeftDock();
    const select1 = screen.getByRole('button', { name: /select · z/i });
    const sew1 = screen.getByRole('button', { name: /sew · b/i });
    expect(select1.compareDocumentPosition(sew1) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    act(() => { store.dispatch(reorderDockTool({ fromId: 'seam', toId: 'select' })); });
    const select2 = screen.getByRole('button', { name: /select · z/i });
    const sew2 = screen.getByRole('button', { name: /sew · b/i });
    expect(sew2.compareDocumentPosition(select2) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
