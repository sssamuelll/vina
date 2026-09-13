/**
 * @vitest-environment jsdom
 *
 * Guards the View menu display toggles (spec 2026-06-04 display-toggles-resurface):
 * 2D — Reference Images checkbox + Line Lengths and Render mode radio trios.
 * 3D — Garment / Seamlines / Internal Lines checkboxes (Task 2).
 *
 * Also guards submenu hover persistence: the flyout sits at
 * `left: calc(100% + 4px)`, so travelling from the parent item into it crosses
 * a 4px band that belongs to the panel, not the item. Closing on the *item's*
 * mouseleave made that band a dead zone — the submenu vanished mid-traverse.
 * Only leaving the whole panel may close it.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import editorReducer from '../../../store/editorSlice';
import simulationReducer from '../../../store/simulationSlice';
import dockReducer from '../../../store/dockSlice';
import projectReducer from '../../../store/projectSlice';
import toolsReducer from '../../../store/toolSlice';
import constructionReducer from '../../../store/constructionSlice';
import copilotUIReducer from '../../../store/copilotUISlice';
import { store as appStore } from '../../../store';
import { selectTrazo } from '../../../store/editorSlice';
import { addTrazo } from '../../../store/projectSlice';
import { clearJournal, getJournal } from '../../../utils/telemetry/journal';
import type { Trazo } from '../../../types/types';
import LogoMenu from '../LogoMenu';

const { downloadDiagnosticBundleMock } = vi.hoisted(() => ({
  downloadDiagnosticBundleMock: vi.fn(),
}));

// uiExport pulls export-heavy deps (pdf/dxf writers) — irrelevant here.
vi.mock('../../../utils/export/uiExport', () => ({ runUiExport: vi.fn() }));
vi.mock('../../../utils/export/diagnosticExporter', () => ({
  downloadDiagnosticBundle: downloadDiagnosticBundleMock,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderMenu() {
  const store = configureStore({
    reducer: {
      editor: editorReducer,
      simulation: simulationReducer,
      dock: dockReducer,
      project: projectReducer,
      tools: toolsReducer,
      construction: constructionReducer,
      copilotUI: copilotUIReducer,
    },
  });
  render(<Provider store={store}><LogoMenu onOpenPanel={() => {}} onImportDXF={() => {}} /></Provider>);
  return store;
}

/** Open the dropdown and hover the View top-level entry so its submenu mounts. */
function openViewMenu() {
  fireEvent.click(screen.getByRole('button', { name: /vina/i }));
  fireEvent.mouseEnter(screen.getByText('Vista'));
}

/** Abre el menú y monta el submenú Archivo. */
function openFileMenu() {
  fireEvent.click(screen.getByRole('button', { name: /vina/i }));
  fireEvent.mouseEnter(screen.getByText('Archivo'));
}

function isChecked(label: string): boolean {
  const item = screen.getByText(label).closest('.logo-menu__item')!;
  return item.querySelector('.logo-menu__check')!.textContent!.trim() !== '';
}

describe('LogoMenu ▸ View — 2D display toggles', () => {
  it('toggles Reference Images and reflects checked state', () => {
    const store = renderMenu();
    const before = store.getState().editor.showReferenceImages;
    openViewMenu();
    expect(isChecked('Imágenes de referencia')).toBe(before);
    fireEvent.click(screen.getByText('Imágenes de referencia'));
    expect(store.getState().editor.showReferenceImages).toBe(!before);
  });

  it('expone los tres modos de Largos como opciones excluyentes', () => {
    const store = renderMenu();
    openViewMenu();
    fireEvent.mouseEnter(screen.getByText('Largos'));
    expect(isChecked('Al crear')).toBe(true);
    expect(isChecked('Todas')).toBe(false);
    expect(isChecked('Ninguna')).toBe(false);

    fireEvent.click(screen.getByText('Todas'));
    expect(store.getState().editor.lineLengthMode).toBe('all');
    expect(store.getState().editor.lineLengthModeSetByUser).toBe(true);

    openViewMenu();
    fireEvent.mouseEnter(screen.getByText('Largos'));
    expect(isChecked('Al crear')).toBe(false);
    expect(isChecked('Todas')).toBe(true);
    expect(isChecked('Ninguna')).toBe(false);

    fireEvent.click(screen.getByText('Ninguna'));
    expect(store.getState().editor.lineLengthMode).toBe('none');
  });

  it('toggles Piquetes and reflects checked state', () => {
    const store = renderMenu();
    const before = store.getState().editor.showNotches;
    openViewMenu();
    expect(isChecked('Piquetes')).toBe(before);

    fireEvent.click(screen.getByText('Piquetes'));
    expect(store.getState().editor.showNotches).toBe(!before);

    openViewMenu();
    expect(isChecked('Piquetes')).toBe(!before);
  });

  it('Render trio is a radio group: selecting Wireframe unchecks Textured', () => {
    const store = renderMenu();
    expect(store.getState().editor.renderMode2D).toBe('textured');
    openViewMenu();
    expect(isChecked('Renderizado: texturizado')).toBe(true);
    expect(isChecked('Renderizado: alambre')).toBe(false);
    fireEvent.click(screen.getByText('Renderizado: alambre'));
    expect(store.getState().editor.renderMode2D).toBe('wireframe');
    // menu closed on click — reopen and re-assert exclusivity
    openViewMenu();
    expect(isChecked('Renderizado: alambre')).toBe(true);
    expect(isChecked('Renderizado: texturizado')).toBe(false);
  });
});

describe('LogoMenu ▸ submenu hover persistence', () => {
  /** Open the dropdown and hover a top-level entry; returns the panel element. */
  function openTop(label: string): HTMLElement {
    fireEvent.click(screen.getByRole('button', { name: /vina/i }));
    fireEvent.mouseEnter(screen.getByText(label));
    return document.querySelector('.logo-menu') as HTMLElement;
  }

  it('stays open when the pointer leaves the parent item toward the flyout', () => {
    renderMenu();
    const panel = openTop('Archivo');
    expect(screen.queryByText('Exportar DXF')).toBeTruthy();

    // The 4px band between item and flyout is over the panel, not the item —
    // hence relatedTarget: the pointer left the item but never left the menu.
    const item = screen.getByText('Archivo').closest('.logo-menu__item')!;
    fireEvent.mouseLeave(item, { relatedTarget: panel });
    expect(screen.queryByText('Exportar DXF')).toBeTruthy();
  });

  it('closes once the pointer leaves the whole panel', () => {
    renderMenu();
    const panel = openTop('Archivo');
    expect(screen.queryByText('Exportar DXF')).toBeTruthy();

    fireEvent.mouseLeave(panel);
    expect(screen.queryByText('Exportar DXF')).toBeNull();
  });

  it('swaps flyouts when another top-level entry is hovered', () => {
    renderMenu();
    openTop('Archivo');
    fireEvent.mouseEnter(screen.getByText('Vista'));

    expect(screen.queryByText('Exportar DXF')).toBeNull();
    expect(screen.queryByText('Zoom 100%')).toBeTruthy();
  });
});

describe('LogoMenu ▸ Archivo — diagnóstico', () => {
  it('descarga el diagnóstico desde la puerta visible de Archivo', () => {
    renderMenu();
    openFileMenu();

    fireEvent.click(screen.getByText('Exportar diagnóstico'));

    expect(downloadDiagnosticBundleMock).toHaveBeenCalledTimes(1);
    expect(downloadDiagnosticBundleMock).toHaveBeenCalledWith(appStore.getState());
  });

  it('avisa en la superficie canónica cuando el navegador no crea el archivo', () => {
    downloadDiagnosticBundleMock.mockImplementationOnce(() => {
      throw new Error('descarga bloqueada');
    });
    const store = renderMenu();
    openFileMenu();

    fireEvent.click(screen.getByText('Exportar diagnóstico'));

    expect(store.getState().copilotUI.toasts).toContainEqual(
      expect.objectContaining({
        type: 'error',
        message: 'No pude exportar el diagnóstico: el navegador no creó el archivo. Inténtalo de nuevo.',
      }),
    );
  });
});

describe('LogoMenu ▸ Ver — Construcción (#1158)', () => {
  it('la fila enciende y apaga editor.showTrazos y se marca sola', () => {
    const store = renderMenu();
    openViewMenu();
    expect(isChecked('Construcción')).toBe(true);
    fireEvent.click(screen.getByText('Construcción'));
    expect(store.getState().editor.showTrazos).toBe(false);
  });
});

/**
 * La segunda puerta de borrado. Edición ▸ Eliminar lee el sujeto del store
 * canónico (`store.getState()`), no del Provider, así que aquí se monta el
 * menú CONTRA ese store: es la única forma de probar la puerta como la usa
 * María, y es justo la puerta que en #1115 se había quedado tres semanas
 * atrás respecto del atajo.
 */
describe('LogoMenu ▸ Edición ▸ Eliminar — tramo de trazo (#1158)', () => {
  const TRAZO: Trazo = {
    id: 'menu-t1',
    path: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [200, 0] },
      { type: 'L', values: [300, 0] },
    ],
    createdAt: 1,
  };

  it('borra ESE tramo, parte el trazo y lo escribe en la bitácora', () => {
    clearJournal();
    appStore.dispatch(addTrazo(TRAZO));
    appStore.dispatch(selectTrazo({ trazoId: 'menu-t1', segmentIndex: 2 }));
    render(<Provider store={appStore}><LogoMenu onOpenPanel={() => {}} onImportDXF={() => {}} /></Provider>);

    fireEvent.click(screen.getByRole('button', { name: /vina/i }));
    fireEvent.mouseEnter(screen.getByText('Edición'));
    fireEvent.click(screen.getByText('Eliminar'));

    // El trazo de cuatro anclas quedó partido en dos, y el original conserva su id.
    const trazos = appStore.getState().project.trazos;
    expect(trazos.filter((t) => t.id === 'menu-t1')).toHaveLength(1);
    expect(trazos.filter((t) => t.path.length === 2)).toHaveLength(2);
    expect(appStore.getState().editor.selectedTrazo).toBeNull();
    expect(getJournal().events.find((e) => e.name === 'trazo:delete')?.data)
      .toEqual({ trazoId: 'menu-t1', segmentIndex: 2, parte: true });
  });
});

describe('LogoMenu ▸ View — 3D display toggles', () => {
  it.each([
    ['3D: prenda', 'showGarment'],
    ['3D: líneas de costura', 'showSeamlines3D'],
    ['3D: líneas internas', 'showInternalLines3D'],
  ] as const)('%s toggles simulation.%s and reflects checked state', (label, field) => {
    const store = renderMenu();
    const before = store.getState().simulation[field];
    openViewMenu();
    expect(isChecked(label)).toBe(before);
    fireEvent.click(screen.getByText(label));
    expect(store.getState().simulation[field]).toBe(!before);
  });
});
