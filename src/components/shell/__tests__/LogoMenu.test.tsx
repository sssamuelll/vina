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
  render(<Provider store={store}><LogoMenu /></Provider>);
  return store;
}

/** Open the dropdown and hover the View top-level entry so its submenu mounts. */
function openViewMenu() {
  fireEvent.click(screen.getByRole('button', { name: /openclo/i }));
  fireEvent.mouseEnter(screen.getByText('View'));
}

function isChecked(label: string): boolean {
  const item = screen.getByText(label).closest('.logo-menu__item')!;
  return item.querySelector('.logo-menu__check')!.textContent === '✓';
}

describe('LogoMenu ▸ View — 2D display toggles', () => {
  it('toggles Reference Images and reflects checked state', () => {
    const store = renderMenu();
    const before = store.getState().editor.showReferenceImages;
    openViewMenu();
    expect(isChecked('Reference Images')).toBe(before);
    fireEvent.click(screen.getByText('Reference Images'));
    expect(store.getState().editor.showReferenceImages).toBe(!before);
  });

  it('toggles Line Lengths', () => {
    const store = renderMenu();
    expect(store.getState().editor.showLineLengths).toBe(false);
    openViewMenu();
    expect(isChecked('Line Lengths')).toBe(false);
    fireEvent.click(screen.getByText('Line Lengths'));
    expect(store.getState().editor.showLineLengths).toBe(true);
  });

  it('Render trio is a radio group: selecting Wireframe unchecks Textured', () => {
    const store = renderMenu();
    expect(store.getState().editor.renderMode2D).toBe('textured');
    openViewMenu();
    expect(isChecked('Render: Textured')).toBe(true);
    expect(isChecked('Render: Wireframe')).toBe(false);
    fireEvent.click(screen.getByText('Render: Wireframe'));
    expect(store.getState().editor.renderMode2D).toBe('wireframe');
    // menu closed on click — reopen and re-assert exclusivity
    openViewMenu();
    expect(isChecked('Render: Wireframe')).toBe(true);
    expect(isChecked('Render: Textured')).toBe(false);
  });
});
