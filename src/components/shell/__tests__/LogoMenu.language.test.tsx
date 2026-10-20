/**
 * @vitest-environment jsdom
 *
 * The Language items under Vina ▸ Preferences (i18n spec § 5.5): one per supported locale,
 * each named in itself and marked with its own `lang`, a check on the active one.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import editorReducer from '../../../store/editorSlice';
import simulationReducer from '../../../store/simulationSlice';
import dockReducer from '../../../store/dockSlice';
import projectReducer from '../../../store/projectSlice';
import toolsReducer from '../../../store/toolSlice';
import constructionReducer from '../../../store/constructionSlice';
import copilotUIReducer from '../../../store/copilotUISlice';
import { getLocale } from '../../../i18n/locale';
import LogoMenu, { PREFERENCES_MENU } from '../LogoMenu';

vi.mock('../../Viewport3D/visorBridge', () => ({ capturarVisor3D: vi.fn(() => true) }));
vi.mock('../../../utils/export/uiExport', () => ({ runUiExport: vi.fn() }));
vi.mock('../../../utils/export/diagnosticExporter', () => ({ downloadDiagnosticBundle: vi.fn() }));

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
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
}

function openPreferences() {
  fireEvent.click(screen.getByRole('button', { name: /vina/i }));
  fireEvent.mouseEnter(screen.getByText('Preferencias'));
}

function isChecked(label: string): boolean {
  const item = screen.getByText(label).closest('.logo-menu__item')!;
  return item.querySelector('.logo-menu__check')!.textContent!.trim() !== '';
}

describe('LogoMenu ▸ Preferences ▸ Language', () => {
  it('lists each language in itself, with its lang, and checks the active one', () => {
    renderMenu();
    openPreferences();
    for (const [name, lang] of [['English', 'en'], ['Español', 'es'], ['Deutsch', 'de']] as const) {
      const label = screen.getByText(name);
      expect(label.classList.contains('logo-menu__label')).toBe(true);
      expect(label.getAttribute('lang')).toBe(lang);
    }
    expect(isChecked('Español')).toBe(true);
    expect(isChecked('English')).toBe(false);
    expect(isChecked('Deutsch')).toBe(false);
  });

  it('a click switches the language, and the check follows', () => {
    renderMenu();
    openPreferences();
    fireEvent.click(screen.getByText('Deutsch'));
    expect(getLocale()).toBe('de');
    openPreferences();
    expect(isChecked('Deutsch')).toBe(true);
    expect(isChecked('Español')).toBe(false);
  });

  it('keeps the existing Preferences items first', () => {
    expect(PREFERENCES_MENU.slice(0, 2)).toEqual([
      { label: 'Avatar y medidas...', panel: 'Avatar' },
      { label: 'IA y ratón...', panel: 'Preferences' },
    ]);
    expect(PREFERENCES_MENU[2]).toMatchObject({ separator: true });
    expect(PREFERENCES_MENU.slice(3).map((item) => item.id)).toEqual(['language.en', 'language.es', 'language.de']);
  });
});
