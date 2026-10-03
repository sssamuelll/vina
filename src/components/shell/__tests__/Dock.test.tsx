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
  { id: 'select', icon: MousePointer2, label: 'Seleccionar', shortcut: 'Z' },
  { id: 'pen', icon: Pen, label: 'Pluma', shortcut: 'H' },
];

describe('Dock (presentational)', () => {
  it('renders the domain label and one button per tool', () => {
    render(<Dock domainLabel="2D" tools={TOOLS} activeToolId="select" onSelectTool={() => {}} />);
    expect(screen.getByText('2D')).toBeTruthy();
    expect(screen.getByRole('button', { name: /seleccionar · z/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /pluma · h/i })).toBeTruthy();
  });

  it('calls onSelectTool with the tool id on click', () => {
    const onSelectTool = vi.fn();
    render(<Dock domainLabel="2D" tools={TOOLS} activeToolId="select" onSelectTool={onSelectTool} />);
    fireEvent.click(screen.getByRole('button', { name: /pluma · h/i }));
    expect(onSelectTool).toHaveBeenCalledWith('pen');
  });

  it('marks the active tool', () => {
    render(<Dock domainLabel="2D" tools={TOOLS} activeToolId="pen" onSelectTool={() => {}} />);
    const penBtn = screen.getByRole('button', { name: /pluma · h/i });
    expect(penBtn.className).toContain('dock__tool--active');
  });

  it('reorders on drop: dragging Select onto Pen calls onReorderTool(select, pen)', () => {
    const onReorderTool = vi.fn();
    render(<Dock domainLabel="2D" tools={TOOLS} activeToolId="select" onSelectTool={() => {}} onReorderTool={onReorderTool} />);
    const dt = makeDataTransfer();
    fireEvent.dragStart(screen.getByRole('button', { name: /seleccionar · z/i }), { dataTransfer: dt });
    fireEvent.dragOver(screen.getByRole('button', { name: /pluma · h/i }), { dataTransfer: dt });
    fireEvent.drop(screen.getByRole('button', { name: /pluma · h/i }), { dataTransfer: dt });
    expect(onReorderTool).toHaveBeenCalledWith('select', 'pen');
  });

  it('a drop onto the same tool does not reorder', () => {
    const onReorderTool = vi.fn();
    render(<Dock domainLabel="2D" tools={TOOLS} activeToolId="select" onSelectTool={() => {}} onReorderTool={onReorderTool} />);
    const dt = makeDataTransfer();
    const sel = screen.getByRole('button', { name: /seleccionar · z/i });
    fireEvent.dragStart(sel, { dataTransfer: dt });
    fireEvent.drop(sel, { dataTransfer: dt });
    expect(onReorderTool).not.toHaveBeenCalled();
  });

  it('tool buttons are not draggable without onReorderTool', () => {
    render(<Dock domainLabel="2D" tools={TOOLS} activeToolId="select" onSelectTool={() => {}} />);
    expect((screen.getByRole('button', { name: /seleccionar · z/i }) as HTMLButtonElement).draggable).toBe(false);
  });

  it('clicking a tool still activates it while reorder is enabled', () => {
    const onSelectTool = vi.fn();
    render(<Dock domainLabel="2D" tools={TOOLS} activeToolId="select" onSelectTool={onSelectTool} onReorderTool={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /pluma · h/i }));
    expect(onSelectTool).toHaveBeenCalledWith('pen');
  });

  it('keeps the accessible name and shows a right-positioned tooltip on hover', () => {
    vi.useFakeTimers();
    const { container } = render(<Dock domainLabel="2D" tools={TOOLS} activeToolId="select" onSelectTool={() => {}} />);
    expect(screen.getByRole('button', { name: /seleccionar · z/i })).toBeTruthy();
    fireEvent.mouseEnter(container.querySelectorAll('.tool-tooltip-wrapper')[0]);
    act(() => { vi.advanceTimersByTime(500); });
    const tip = document.querySelector('.tool-tooltip');
    expect(tip).toBeTruthy();
    expect(tip!.classList.contains('tooltip-right')).toBe(true);
    expect(tip!.querySelector('.tool-tooltip-name')!.textContent).toBe('Seleccionar');
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
    fireEvent.click(screen.getByRole('button', { name: /coser · n/i }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Escalar' }));
    expect(onOpenPanel).toHaveBeenCalledWith('Grading');
  });

  it('keeps a grade suggestion (✦→📌) and records it in the dock slice', () => {
    const { store } = renderLeftDock();
    act(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      store.dispatch(addPiece({ id: 'p1', name: 'P', outline: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false, seamAllowance: 10, internals: [], createdAt: 0, updatedAt: 0, active: false } as any));
    });
    fireEvent.click(screen.getByRole('button', { name: 'Fijar Escalar' }));
    expect(store.getState().dock.pinnedExtra.left).toEqual(['grade']);
    expect(screen.getByRole('button', { name: 'Soltar Escalar' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Fijar Escalar' })).toBeNull();
  });

  it('signaling=off mutes the auto layer but shows no suggestion', () => {
    const { store } = renderLeftDock();
    act(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      store.dispatch(addPiece({ id: 'p1', name: 'P', outline: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false, seamAllowance: 10, internals: [], createdAt: 0, updatedAt: 0, active: false } as any));
      store.dispatch(toggleDockSignaling()); // → 'off'
    });
    expect(screen.queryByText('auto')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Fijar Escalar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Escalar' })).toBeNull();
  });

  it('off: a kept tool still renders (plain, no Unpin badge)', () => {
    const { store } = renderLeftDock();
    act(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      store.dispatch(addPiece({ id: 'p1', name: 'P', outline: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false, seamAllowance: 10, internals: [], createdAt: 0, updatedAt: 0, active: false } as any));
      store.dispatch(pinAuto({ side: 'left', id: 'grade' }));
      store.dispatch(toggleDockSignaling()); // → 'off'
    });
    expect(screen.getByRole('button', { name: 'Escalar' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Soltar Escalar' })).toBeNull();
  });

  // Usaba 'notch' (Piquete), que desde la auditoría de UI del 2026-08-14 viene
  // en el dock por defecto — ya no sirve para probar "agregar algo que no está".
  // 'grainline' (Hilo) sí queda fuera del default.
  it('adds a catalog tool to the dock when dispatched', () => {
    const { store } = renderLeftDock();
    expect(screen.queryByRole('button', { name: /hilo/i })).toBeNull();
    act(() => { store.dispatch(addDockTool('grainline')); });
    expect(screen.getByRole('button', { name: /hilo/i })).toBeTruthy();
  });

  it('removes a default tool from the dock when dispatched', () => {
    const { store } = renderLeftDock();
    expect(screen.getByRole('button', { name: /pluma · h/i })).toBeTruthy();
    act(() => { store.dispatch(removeDockTool('pen')); });
    expect(screen.queryByRole('button', { name: /pluma · h/i })).toBeNull();
  });

  it('the ＋ button toggles the picker and Escape closes it', () => {
    renderLeftDock();
    const add = screen.getByRole('button', { name: 'Personalizar herramientas del dock' });
    expect(screen.queryByRole('group', { name: 'Personalizar herramientas del dock' })).toBeNull();
    fireEvent.click(add);
    expect(screen.getByRole('group', { name: 'Personalizar herramientas del dock' })).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('group', { name: 'Personalizar herramientas del dock' })).toBeNull();
  });

  it('the ＋ picker closes on a click outside the dock editor', () => {
    renderLeftDock();
    fireEvent.click(screen.getByRole('button', { name: 'Personalizar herramientas del dock' }));
    expect(screen.getByRole('group', { name: 'Personalizar herramientas del dock' })).toBeTruthy();
    // mousedown outside the editorRef wrapper closes the picker (the trigger is
    // inside the ref, so opening it never self-closes — this guards that seam).
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('group', { name: 'Personalizar herramientas del dock' })).toBeNull();
  });

  it('el teclado entra al personalizador y vuelve al «+» con Escape', () => {
    // El personalizador cuelga de <body> (P1b): en el DOM queda lejos del «+»,
    // y Tab desde el botón ya no entraba en la lista (revisión final de P1b).
    renderLeftDock();
    const add = screen.getByRole('button', { name: 'Personalizar herramientas del dock' });
    add.focus();
    fireEvent.click(add);
    const menu = screen.getByRole('group', { name: 'Personalizar herramientas del dock' });
    expect(menu.contains(document.activeElement), 'el foco se quedó fuera del personalizador').toBe(true);
    expect(add.getAttribute('aria-controls'), 'el «+» no dice qué abre').toBe(menu.id);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(document.activeElement, 'Escape no devolvió el foco al «+»').toBe(add);
  });

  it('renders tools in tools2d order; reordering moves the tool in the DOM', () => {
    const { store } = renderLeftDock();
    const select1 = screen.getByRole('button', { name: /seleccionar · z/i });
    const sew1 = screen.getByRole('button', { name: /coser · n/i });
    expect(select1.compareDocumentPosition(sew1) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    act(() => { store.dispatch(reorderDockTool({ fromId: 'seam', toId: 'select' })); });
    const select2 = screen.getByRole('button', { name: /seleccionar · z/i });
    const sew2 = screen.getByRole('button', { name: /coser · n/i });
    expect(sew2.compareDocumentPosition(select2) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
