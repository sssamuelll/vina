/**
 * @vitest-environment jsdom
 *
 * Guards the View menu display toggles (spec 2026-06-04 display-toggles-resurface):
 * 2D — Reference Images / Line Lengths checkboxes + Render mode radio trio.
 * 3D — Garment / Seamlines / Internal Lines checkboxes (Task 2).
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
import LogoMenu from '../LogoMenu';

// uiExport pulls export-heavy deps (pdf/dxf writers) — irrelevant here.
vi.mock('../../../utils/export/uiExport', () => ({ runUiExport: vi.fn() }));

afterEach(cleanup);

function renderMenu() {
  const store = configureStore({
    reducer: {
      editor: editorReducer,
      simulation: simulationReducer,
      dock: dockReducer,
      project: projectReducer,
      tools: toolsReducer,
      construction: constructionReducer,
    },
  });
  render(<Provider store={store}><LogoMenu onOpenPanel={() => {}} onImportDXF={() => {}} /></Provider>);
  return store;
}

/** Open the dropdown and hover the View top-level entry so its submenu mounts. */
function openViewMenu() {
  fireEvent.click(screen.getByRole('button', { name: /openclo/i }));
  fireEvent.mouseEnter(screen.getByText('Vista'));
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

  it('toggles Line Lengths', () => {
    const store = renderMenu();
    const before = store.getState().editor.showLineLengths;
    openViewMenu();
    expect(isChecked('Largos de línea')).toBe(before);
    fireEvent.click(screen.getByText('Largos de línea'));
    expect(store.getState().editor.showLineLengths).toBe(!before);
  });

  it('Render trio is a radio group: selecting Wireframe unchecks Textured', () => {
    const store = renderMenu();
    expect(store.getState().editor.renderMode2D).toBe('textured');
    openViewMenu();
    expect(isChecked('Render: texturizado')).toBe(true);
    expect(isChecked('Render: alambre')).toBe(false);
    fireEvent.click(screen.getByText('Render: alambre'));
    expect(store.getState().editor.renderMode2D).toBe('wireframe');
    // menu closed on click — reopen and re-assert exclusivity
    openViewMenu();
    expect(isChecked('Render: alambre')).toBe(true);
    expect(isChecked('Render: texturizado')).toBe(false);
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
