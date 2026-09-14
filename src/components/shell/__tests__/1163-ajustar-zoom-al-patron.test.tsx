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
import { displayShortcutBinding } from '../shortcutDisplay';
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

  /**
   * ENDURECIDO el 2026-09-14 tras la revisión adversarial. La primera versión
   * buscaba el def por id y pulsaba el literal `'0'` a mano: dos cadenas que no
   * salían del menú. Con eso, cambiar el rótulo a `⌘9` dejaba el test en VERDE
   * — es decir, el menú podía volver a mentir exactamente igual que en #1163,
   * que es lo que este archivo dice que vigila. Y como solo disparaba
   * `ctrlKey`, tampoco tocaba el `e.metaKey ||` del registro, que es lo único
   * que hace que ⌘ funcione en Mac.
   *
   * Ahora el combo sale del ROTULO que se pinta, y se pulsa por los dos lados.
   */
  it('el atajo que el menú anuncia existe en el registro, se escribe igual y hace lo mismo', () => {
    const store = makeStore();
    render(<Provider store={store}><LogoMenu onOpenPanel={() => {}} onImportDXF={() => {}} /></Provider>);
    fireEvent.click(screen.getByRole('button', { name: /vina/i }));
    fireEvent.mouseEnter(screen.getByText('Vista'));

    // 1. Lo que María tiene delante.
    const fila = screen.getByText('Ajustar zoom al patrón').closest('.logo-menu__item')!;
    const rotulo = fila.querySelector('.logo-menu__shortcut')?.textContent?.trim() ?? '';
    expect(rotulo, 'la entrada anuncia un atajo').not.toBe('');

    // 2. El registro tiene que declarar ESE combo, no uno cualquiera.
    const def = DEFAULT_SHORTCUTS.find(s => s.id === 'view.fitPattern');
    expect(def, 'el menú promete un atajo: tiene que existir en el registro').toBeDefined();
    expect(
      displayShortcutBinding({ key: def!.key, ctrl: def!.ctrl, shift: def!.shift, alt: def!.alt }),
      'el rótulo del menú y el atajo registrado tienen que ser el MISMO combo',
    ).toBe(rotulo);

    // 3. Y ese combo tiene que encuadrar. Por los dos lados: el registro
    //    resuelve con `e.metaKey || e.ctrlKey`, y el rótulo dice ⌘, así que la
    //    tecla de Mac es parte de la promesa, no un detalle de implementación.
    cleanup();
    for (const [nombre, mod] of [['Ctrl', { ctrlKey: true }], ['⌘', { metaKey: true }]] as const) {
      const s2 = makeStore();
      const view = render(
        <Provider store={s2}><ShortcutProvider><Hooked /></ShortcutProvider></Provider>,
      );
      const foco = view.getByTestId('foco');
      foco.focus();
      const antes = s2.getState().editor.fitViewToken;
      act(() => {
        foco.dispatchEvent(new KeyboardEvent('keydown', { key: def!.key, ...mod, bubbles: true }));
      });
      expect(s2.getState().editor.fitViewToken, `pulsar ${nombre}+${def!.key} tiene que encuadrar`).toBe(antes + 1);
      cleanup();
    }
  });

});
