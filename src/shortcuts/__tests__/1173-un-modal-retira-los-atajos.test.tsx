// @vitest-environment jsdom
/**
 * #1173 — con un diálogo modal abierto, los atajos globales se retiran.
 *
 * `ShortcutProvider` ya se retiraba ante un campo editable, y por la razón
 * correcta: la tecla es de quien tiene la atención. Un modal tapa MÁS que un
 * campo de texto, no menos — y sin embargo pasaba entera, así que Supr se
 * llevaba la pieza de detrás mientras María leía la pregunta.
 *
 * El detector es `[aria-modal="true"]`, que es justo la pregunta que ARIA
 * responde, y no una marca inventada. Eso deja fuera —a propósito— a los
 * diálogos NO modales: `NotchPrecisionModal` declara `role="dialog"` pero no
 * tiene velo, se abre junto a la pieza y el lienzo sigue vivo detrás. Un
 * detector por `role="dialog"` lo habría barrido con los demás; el caso de
 * abajo es lo que lo impide.
 *
 * El duelo de orden entre oyentes no se puede medir aquí (jsdom no lo
 * reproduce) y lo mide `tests/e2e/supr-con-algo-delante.spec.ts`. Lo de aquí
 * es la otra mitad: a quién deja pasar la guarda.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { ShortcutProvider } from '../ShortcutProvider';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import editorReducer from '../../store/editorSlice';
import projectReducer from '../../store/projectSlice';
import simulationReducer from '../../store/simulationSlice';
import toolReducer from '../../store/toolSlice';
import CalibrationModal from '../../components/PatternEditor/CalibrationModal';
import ConnectionModal from '../../copilot/connections/ConnectionModal';
import NotchPrecisionModal from '../../components/PatternEditor/NotchPrecisionModal';

afterEach(cleanup);

function makeStore() {
  return configureStore({
    reducer: { editor: editorReducer, project: projectReducer, simulation: simulationReducer, tools: toolReducer },
  });
}

/** `superficie` se pinta al lado del lienzo, como lo hace un modal del shell. */
function montar(superficie: React.ReactNode = null) {
  const store = makeStore();
  function Hooked() {
    useKeyboardShortcuts();
    return <div data-shortcut-context="2d" tabIndex={0} data-testid="lienzo" />;
  }
  const view = render(
    <Provider store={store}>
      <ShortcutProvider><Hooked />{superficie}</ShortcutProvider>
    </Provider>,
  );
  const lienzo = view.getByTestId('lienzo');
  lienzo.focus();
  return { store, lienzo };
}

const pulsar = (target: Element, key: string, ctrl = false) => {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ctrlKey: ctrl });
  act(() => { target.dispatchEvent(e); });
  return e;
};

const MODAL = <div role="dialog" aria-modal="true" aria-label="¿Unir las piezas?" />;
/** Como `NotchPrecisionModal`: diálogo, pero sin velo — el lienzo sigue vivo. */
const NO_MODAL = <div role="dialog" aria-label="Colocación de piquete" />;

describe('#1173 — la tecla es de quien tiene la atención', () => {
  it('CONTROL: sin nada delante, el atajo llega y cambia de herramienta', () => {
    const { store, lienzo } = montar();
    pulsar(lienzo, 'q');
    expect(store.getState().editor.activeTool).toBe('editPattern');
  });

  it('con un modal abierto, el atajo no llega', () => {
    const { store, lienzo } = montar(MODAL);
    const antes = store.getState().editor.activeTool;
    pulsar(lienzo, 'q');
    expect(store.getState().editor.activeTool, 'un atajo se coló detrás del modal').toBe(antes);
  });

  it('un diálogo NO modal no retira nada: el lienzo sigue vivo detrás', () => {
    // El caso que refuta el detector fácil. `role="dialog"` habría apagado
    // los atajos con el popover del piquete abierto, que se usa justo para
    // seguir trabajando sobre la pieza.
    const { store, lienzo } = montar(NO_MODAL);
    pulsar(lienzo, 'q');
    expect(store.getState().editor.activeTool, 'un popover apagó los atajos').toBe('editPattern');
  });

  it('Escape es la excepción: sigue pasando con el modal abierto', () => {
    // Misma excepción que la guarda de campos que ya estaba arriba. Sin ella
    // un modal sin Escape propio dejaría a María encerrada dentro de él.
    //
    // Se mide por su EFECTO (`selection.deselect` vacía la selección) y no
    // espiando el evento en `document`: ahí la tecla llega igual haga lo que
    // haga la guarda, así que ese espía pasaba en verde siempre.
    const { store, lienzo } = montar(MODAL);
    store.dispatch({ type: 'editor/selectPiece', payload: 'p1' });
    expect(store.getState().editor.selectedPieceIds, 'el caso no se ejerce').toEqual(['p1']);

    pulsar(lienzo, 'Escape');

    expect(store.getState().editor.selectedPieceIds, 'Escape dejó de llegar').toEqual([]);
  });
});

describe('#1173 — retirarse no es soltarle la tecla al navegador', () => {
  it('un atajo nuestro retirado se suprime igual', () => {
    // El hueco que dejó la primera versión: el `return` de la guarda salía
    // ANTES del único `preventDefault`, así que la tecla dejaba de hacer lo
    // de Vina y encima el navegador se quedaba con su default. Medido en
    // navegador: Ctrl+A seleccionaba el texto de la página por encima del
    // diálogo, y Ctrl+R recarga la app entera con la pregunta en pantalla.
    const { lienzo } = montar(MODAL);
    const e = pulsar(lienzo, 'r', true); // edit.mirrorPaste
    expect(e.defaultPrevented, 'Ctrl+R se le fue al navegador').toBe(true);
  });

  it('una tecla que NO es atajo nuestro se deja pasar entera', () => {
    // El control del de arriba: suprimir todo sería robarle al navegador
    // teclas que nunca fueron nuestras (Ctrl+P, por ejemplo).
    const { lienzo } = montar(MODAL);
    const e = pulsar(lienzo, 'F9');
    expect(e.defaultPrevented, 'se suprimió una tecla que no es nuestra').toBe(false);
  });

  it('un modal escondido no cuenta: el teclado no se muere sin avisar', () => {
    // `AppShell` deja el panel 2D montado con `display:none` en modo Solo 3D,
    // y `CalibrationModal` vive dentro. Sin comprobar visibilidad, un modal
    // invisible dejaba a María sin teclado y sin nada en pantalla que lo
    // explicara — reproducido en navegador con el copiloto cambiando de vista.
    const { store, lienzo } = montar(
      <div style={{ display: 'none' }}>
        <div role="dialog" aria-modal="true" aria-label="Calibración de escala" />
      </div>,
    );
    pulsar(lienzo, 'q');
    expect(store.getState().editor.activeTool, 'un modal invisible apagó los atajos')
      .toBe('editPattern');
  });
});

describe('#1173 — y los modales REALES de la app se declaran modales', () => {
  // Lo que faltaba, y era el hueco grande: los casos de arriba fabrican un
  // `<div aria-modal>` a mano, así que prueban la GUARDA y no las superficies.
  // Se podían borrar enteros los dos `aria-modal` que esta rama añadió y todo
  // seguía en verde. Esto los ata.
  const nada = () => {};

  it('con la calibración de escala abierta, el atajo no llega al lienzo', () => {
    const { store, lienzo } = montar(
      <CalibrationModal pixelDistance={120} onConfirm={nada} onCancel={nada} />,
    );
    const antes = store.getState().editor.activeTool;
    pulsar(lienzo, 'q');
    expect(store.getState().editor.activeTool, 'un atajo se coló detrás del modal').toBe(antes);
  });

  it('con el modal de conexiones abierto, tampoco', () => {
    const { store, lienzo } = montar(<ConnectionModal mode="add" onSave={nada} onClose={nada} />);
    const antes = store.getState().editor.activeTool;
    pulsar(lienzo, 'q');
    expect(store.getState().editor.activeTool, 'un atajo se coló detrás del modal').toBe(antes);
  });

  it('CONTROL: el panel del piquete NO es modal, y el lienzo sigue vivo detrás', () => {
    // Es el que decide si el detector está bien elegido. No tiene velo, se
    // abre junto a la pieza y está ahí justo para seguir trabajando sobre
    // ella. Un detector por `role="dialog"` lo habría apagado con los demás.
    const { store, lienzo } = montar(
      <NotchPrecisionModal
        initialDistanceMm={10} initialDepthMm={5} maxDistanceMm={100}
        onConfirm={nada} onCancel={nada}
      />,
    );
    pulsar(lienzo, 'q');
    expect(store.getState().editor.activeTool, 'el panel del piquete apagó los atajos')
      .toBe('editPattern');
  });
});
