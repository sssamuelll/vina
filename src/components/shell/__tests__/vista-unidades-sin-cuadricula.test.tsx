// @vitest-environment jsdom
/**
 * El menú Vista después de «la interfaz en papel» (spec 2026-10-02 § 4.4 y § 8).
 *
 * «Cuadrícula» despachaba `toggleSnapToGrid()`, y `snapToGrid` no tenía ningún
 * lector: un interruptor que no ocultaba nada. Y las unidades se llamaban
 * «Regla: cm», cuando la regla ya no existe y las leen las cotas, Medir y los
 * trazos.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { COMMANDS } from '../unifiedBarCommandDefs';
import constructionReducer from '../../../store/constructionSlice';
import copilotUIReducer from '../../../store/copilotUISlice';
import dockReducer from '../../../store/dockSlice';
import editorReducer from '../../../store/editorSlice';
import projectReducer from '../../../store/projectSlice';
import simulationReducer from '../../../store/simulationSlice';
import toolsReducer from '../../../store/toolSlice';
import LogoMenu from '../LogoMenu';

vi.mock('../../../utils/export/uiExport', () => ({ runUiExport: vi.fn() }));
vi.mock('../../../utils/export/diagnosticExporter', () => ({ downloadDiagnosticBundle: vi.fn() }));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

function abrirVista() {
  const store = configureStore({
    reducer: {
      editor: editorReducer, project: projectReducer, tools: toolsReducer,
      simulation: simulationReducer, dock: dockReducer,
      construction: constructionReducer, copilotUI: copilotUIReducer,
    },
  });
  render(<Provider store={store}><LogoMenu onOpenPanel={() => {}} onImportDXF={() => {}} /></Provider>);
  fireEvent.click(screen.getByRole('button', { name: /vina/i }));
  fireEvent.mouseEnter(screen.getByText('Vista'));
  const rotulos = Array.from(document.querySelectorAll('.logo-menu__label')).map((el) => el.textContent?.trim() ?? '');
  return { store, rotulos };
}

describe('el menú Vista', () => {
  it('el barrido ve el cajón abierto (control)', () => {
    expect(abrirVista().rotulos).toContain('Margen de costura');
  });

  it('no ofrece un interruptor de cuadrícula', () => {
    expect(abrirVista().rotulos).not.toContain('Cuadrícula');
  });

  it('las unidades se llaman «Unidades», no «Regla»', () => {
    const { rotulos } = abrirVista();
    expect(rotulos).toEqual(expect.arrayContaining(['Unidades: cm', 'Unidades: pulgadas', 'Unidades: mm']));
    expect(rotulos.filter((r) => r.startsWith('Regla'))).toEqual([]);
  });

  it('y siguen cambiando la unidad', () => {
    const { store } = abrirVista();
    fireEvent.click(screen.getByText('Unidades: cm'));
    expect(store.getState().editor.units).toBe('cm');
  });
});

describe('la paleta de comandos', () => {
  it('no ofrece mostrar u ocultar la cuadrícula', () => {
    expect(COMMANDS.find((c) => c.id === 'toggle-grid')).toBeUndefined();
    expect(COMMANDS.filter((c) => /cuadrícula/i.test(c.name))).toEqual([]);
  });
});
