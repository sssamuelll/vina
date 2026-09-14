// @vitest-environment jsdom
/**
 * #1163 — Ver ▸ «Ajustar zoom al patrón» despachaba al vacío.
 *
 * `LogoMenu.tsx:163` mandaba `{ type: 'editor/computeFitView' }`. Esa cadena no
 * es ninguna acción del slice: `computeFitView` es una FUNCIÓN PURA exportada
 * de `editorSlice.ts`, y el reducer que encuadra es `requestFitView`. Ningún
 * middleware la escuchaba. La entrada de menú existía, se podía clicar, y no
 * encuadraba nada — una puerta que se abre a una pared.
 *
 * Y el rótulo «⌘0» que la entrada anuncia tampoco existía en
 * `src/shortcuts/defaults.ts`. La ley de idioma y atajos del contrato de
 * interfaz (§ 5) dice que lo que se muestra tiene que existir: un atajo
 * anunciado y no registrado es, para María, un atajo roto.
 *
 * Los dos casos de abajo son las dos mitades de la misma promesa — que lo que
 * el menú ofrece, ocurra — y por eso viven en el mismo archivo.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { DEFAULT_SHORTCUTS } from '../../../shortcuts/defaults';
import { ShortcutProvider } from '../../../shortcuts/ShortcutProvider';
import { useKeyboardShortcuts } from '../../../hooks/useKeyboardShortcuts';
import editorReducer from '../../../store/editorSlice';
import projectReducer from '../../../store/projectSlice';
import simulationReducer from '../../../store/simulationSlice';
import toolsReducer from '../../../store/toolSlice';
import dockReducer from '../../../store/dockSlice';
import constructionReducer from '../../../store/constructionSlice';
import copilotUIReducer from '../../../store/copilotUISlice';
import LogoMenu from '../LogoMenu';

// uiExport arrastra los escritores de pdf/dxf, que aquí no pintan nada.
vi.mock('../../../utils/export/uiExport', () => ({ runUiExport: vi.fn() }));
vi.mock('../../../utils/export/diagnosticExporter', () => ({ downloadDiagnosticBundle: vi.fn() }));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

function makeStore() {
  return configureStore({
    reducer: {
      editor: editorReducer,
      project: projectReducer,
      simulation: simulationReducer,
      tools: toolsReducer,
      dock: dockReducer,
      construction: constructionReducer,
      copilotUI: copilotUIReducer,
    },
  });
}

function Hooked() {
  useKeyboardShortcuts();
  return <div data-shortcut-context="2d" tabIndex={0} data-testid="foco" />;
}

describe('#1163 — Ver ▸ Ajustar zoom al patrón', () => {
  it('el clic en la entrada de menú pide el encuadre de verdad', () => {
    const store = makeStore();
    render(<Provider store={store}><LogoMenu onOpenPanel={() => {}} onImportDXF={() => {}} /></Provider>);
    const antes = store.getState().editor.fitViewToken;

    fireEvent.click(screen.getByRole('button', { name: /vina/i }));
    fireEvent.mouseEnter(screen.getByText('Vista'));
    fireEvent.click(screen.getByText('Ajustar zoom al patrón'));

    expect(
      store.getState().editor.fitViewToken,
      'la entrada tiene que subir el testigo que el editor observa, no despachar una cadena muerta',
    ).toBe(antes + 1);
  });

  it('el ⌘0 que el menú anuncia está registrado y hace lo mismo', () => {
    const def = DEFAULT_SHORTCUTS.find(s => s.id === 'view.fitPattern');
    expect(def, 'el menú promete ⌘0: tiene que existir en el registro').toBeDefined();
    expect(def).toMatchObject({ key: '0', ctrl: true });
    expect(def?.shift ?? false, 'el rótulo dice ⌘0, no ⌘⇧0').toBe(false);
    expect(def?.alt ?? false, 'el rótulo dice ⌘0, no ⌥⌘0').toBe(false);

    // Registrado no basta: un atajo en el catálogo sin manejador es la misma
    // puerta a una pared, solo que en el otro lado.
    const store = makeStore();
    const view = render(
      <Provider store={store}><ShortcutProvider><Hooked /></ShortcutProvider></Provider>,
    );
    const foco = view.getByTestId('foco');
    foco.focus();
    const antes = store.getState().editor.fitViewToken;
    act(() => {
      foco.dispatchEvent(new KeyboardEvent('keydown', { key: '0', ctrlKey: true, bubbles: true }));
    });
    expect(
      store.getState().editor.fitViewToken,
      'pulsar ⌘0 tiene que encuadrar, igual que la entrada de menú',
    ).toBe(antes + 1);
  });
});
