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
import dockReducer, { addDockTool, removeDockTool, reorderDockTool } from '../../../store/dockSlice';
import { activate2DTool } from '../../../store/toolActivation';
import LeftDock from '../LeftDock';
import { ShortcutProvider } from '../../../shortcuts/ShortcutProvider';

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
  { id: 'select', icon: MousePointer2, label: 'Seleccionar', shortcut: 'Z', grupo: 'editar' as const },
  { id: 'pen', icon: Pen, label: 'Pluma', shortcut: 'H', grupo: 'dibujar' as const },
];

describe('Dock (presentational)', () => {
  it('es el margen del patrón: papel, sin rótulo «2D», un botón por herramienta', () => {
    render(<Dock tools={TOOLS} activeToolId="select" onSelectTool={() => {}} />);
    const margen = screen.getByRole('navigation', { name: 'Herramientas del patrón' });
    expect(margen.getAttribute('data-material')).toBe('papel');
    expect(margen.getAttribute('data-superficie')).toBe('ambiente');
    expect(screen.queryByText('2D')).toBeNull();
    expect(screen.getByRole('button', { name: /seleccionar · z/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /pluma · h/i })).toBeTruthy();
  });

  it('entre dos grupos hay aire, y dentro de un grupo no', () => {
    const { container } = render(
      <Dock
        tools={[...TOOLS, { id: 'rectangle', icon: Pen, label: 'Rectángulo', shortcut: 'S', grupo: 'dibujar' as const }]}
        activeToolId="select"
        onSelectTool={() => {}}
      />,
    );
    // editar | dibujar, dibujar: un solo hueco, entre Seleccionar y Pluma.
    expect(container.querySelectorAll('.margen__aire')).toHaveLength(1);
  });

  it('la activa que no está en el margen se pinta al final, marcada', () => {
    const fuera = { id: 'grainline', icon: Pen, label: 'Hilo', shortcut: '⇧G', grupo: 'dibujar' as const };
    render(<Dock tools={TOOLS} activeToolId="grainline" activaFuera={fuera} onSelectTool={() => {}} />);
    const botones = screen.getAllByRole('button');
    const ultima = botones[botones.length - 1];
    expect(ultima.getAttribute('aria-label')).toMatch(/^Hilo/);
    expect(ultima.getAttribute('aria-pressed')).toBe('true');
    expect(ultima.className).toContain('dock__tool--active');
  });

  it('calls onSelectTool with the tool id on click', () => {
    const onSelectTool = vi.fn();
    render(<Dock tools={TOOLS} activeToolId="select" onSelectTool={onSelectTool} />);
    fireEvent.click(screen.getByRole('button', { name: /pluma · h/i }));
    expect(onSelectTool).toHaveBeenCalledWith('pen');
  });

  it('marks the active tool', () => {
    render(<Dock tools={TOOLS} activeToolId="pen" onSelectTool={() => {}} />);
    const penBtn = screen.getByRole('button', { name: /pluma · h/i });
    expect(penBtn.className).toContain('dock__tool--active');
  });

  it('reorders on drop: dragging Select onto Pen calls onReorderTool(select, pen)', () => {
    const onReorderTool = vi.fn();
    render(<Dock tools={TOOLS} activeToolId="select" onSelectTool={() => {}} onReorderTool={onReorderTool} />);
    const dt = makeDataTransfer();
    fireEvent.dragStart(screen.getByRole('button', { name: /seleccionar · z/i }), { dataTransfer: dt });
    fireEvent.dragOver(screen.getByRole('button', { name: /pluma · h/i }), { dataTransfer: dt });
    fireEvent.drop(screen.getByRole('button', { name: /pluma · h/i }), { dataTransfer: dt });
    expect(onReorderTool).toHaveBeenCalledWith('select', 'pen');
  });

  it('a drop onto the same tool does not reorder', () => {
    const onReorderTool = vi.fn();
    render(<Dock tools={TOOLS} activeToolId="select" onSelectTool={() => {}} onReorderTool={onReorderTool} />);
    const dt = makeDataTransfer();
    const sel = screen.getByRole('button', { name: /seleccionar · z/i });
    fireEvent.dragStart(sel, { dataTransfer: dt });
    fireEvent.drop(sel, { dataTransfer: dt });
    expect(onReorderTool).not.toHaveBeenCalled();
  });

  it('tool buttons are not draggable without onReorderTool', () => {
    render(<Dock tools={TOOLS} activeToolId="select" onSelectTool={() => {}} />);
    expect((screen.getByRole('button', { name: /seleccionar · z/i }) as HTMLButtonElement).draggable).toBe(false);
  });

  it('clicking a tool still activates it while reorder is enabled', () => {
    const onSelectTool = vi.fn();
    render(<Dock tools={TOOLS} activeToolId="select" onSelectTool={onSelectTool} onReorderTool={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /pluma · h/i }));
    expect(onSelectTool).toHaveBeenCalledWith('pen');
  });

  it('keeps the accessible name and shows a right-positioned tooltip on hover', () => {
    vi.useFakeTimers();
    const { container } = render(<Dock tools={TOOLS} activeToolId="select" onSelectTool={() => {}} />);
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

function renderLeftDock() {
  const store = configureStore({
    reducer: { editor: editorReducer, tools: toolsReducer, project: projectReducer, simulation: simulationReducer, dock: dockReducer },
  });
  render(<Provider store={store}><ShortcutProvider><LeftDock /></ShortcutProvider></Provider>);
  return { store };
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
    render(<Provider store={store}><ShortcutProvider><LeftDock /></ShortcutProvider></Provider>);
    expect(screen.queryByRole('button', { name: /seleccionar · z/i })).toBeNull();
  });

  it('la activa siempre tiene marca: una del catálogo que no está en el margen aparece al final', () => {
    const { store } = renderLeftDock();
    expect(screen.queryByRole('button', { name: /hilo/i })).toBeNull();
    act(() => { activate2DTool(store.dispatch, 'grainline'); });
    const hilo = screen.getByRole('button', { name: /hilo/i });
    expect(hilo.getAttribute('aria-pressed')).toBe('true');
    // Se va en cuanto deja de estar activa: no se queda pegada al margen.
    act(() => { activate2DTool(store.dispatch, 'select'); });
    expect(screen.queryByRole('button', { name: /hilo/i })).toBeNull();
  });

  it('y una que no es del catálogo sale con su nombre del registro (Transformar, con A)', () => {
    const { store } = renderLeftDock();
    act(() => { activate2DTool(store.dispatch, 'transform'); });
    const transformar = screen.getByRole('button', { name: 'Transformar patrón' });
    expect(transformar.getAttribute('aria-pressed')).toBe('true');
  });

  it('sin zona AUTO: con piezas no aparece ninguna sugerencia (spec 2026-10-02 § 8)', () => {
    const { store } = renderLeftDock();
    act(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      store.dispatch(addPiece({ id: 'p1', name: 'P', outline: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false, seamAllowance: 10, internals: [], createdAt: 0, updatedAt: 0, active: false } as any));
    });
    expect(screen.queryByRole('button', { name: 'Escalar' })).toBeNull();
    expect(screen.queryByText('auto')).toBeNull();
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
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
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
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
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
