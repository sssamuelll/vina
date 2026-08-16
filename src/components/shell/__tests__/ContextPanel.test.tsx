/**
 * @vitest-environment jsdom
 */
import { useCallback, useState } from 'react';
import { flushSync } from 'react-dom';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import ContextPanel from '../ContextPanel';

afterEach(cleanup);

// H-2: reproduce el mecanismo real, no solo el síntoma. El bug no es que
// ContextPanel "a veces no cierra" — es que AppShell.tsx pasaba un `onClose`
// en flecha en línea (`() => closePanel(leftPanel)`), que cambia de
// identidad en cada render. Ese cambio re-suscribe el efecto de Escape: si
// ALGO vacía la actualización entre los dos listeners de `window` (React 18
// lo hace para prioridad discreta en la app real; es un detalle de
// implementación, no una decisión de diseño — un upgrade de React puede
// voltearlo en silencio), el listener que se quitó durante el propio
// despacho del evento ya no se invoca — el de la izquierda gana siempre
// porque su efecto se registra primero.
//
// jsdom despacha los dos listeners de `window` en un solo tick síncrono, sin
// ceder a ningún checkpoint de microtareas entre ellos — así que un
// `fireEvent` liso no interpone nada entre los dos y el bug, que depende
// justo de ese interleaving, no se ve ahí. Esperar a que jsdom lo reprodujera
// solo habría sido un test que pasa o falla por una razón que no
// controlamos. En vez de eso, `flushSync` alrededor del primer `onClose` (el
// izquierdo, que se registra primero) PROVOCA DETERMINISTAMENTE, a propósito,
// la misma carrera que en el navegador ocurre sola: fuerza el re-render (y
// por tanto, si la identidad de onClose cambia, la re-suscripción del
// efecto) antes de que el segundo listener sea invocado. Forzar el punto de
// carrera es más honesto que rezarle al timing.
//
// Lo que este test AFIRMA no es un timing — es la estabilidad de la
// referencia. Comprobado a mano antes de fijar esta versión:
// - Con `onClose` recreado en línea en cada render (el patrón viejo de
//   AppShell.tsx, `() => closePanel(x)`), este mismo arnés con el mismo
//   `flushSync` deja "Capas" sin cerrar — falla exactamente como describe
//   H-2 (izquierda gana siempre, porque su efecto se registra primero).
// - Con `onClose` ESTABLE (useCallback de dependencias vacías — el arreglo:
//   `closeLeft`/`closeRight` de usePanelHost, pasados directo sin flecha),
//   el mismo `flushSync` deja de importar: la identidad no cambia, el
//   efecto no se re-suscribe, y los dos listeners siguen registrados
//   durante todo el despacho, sin importar cuándo caiga el re-render. Esta
//   es la versión que se queda: fija el arreglo (estabilidad referencial),
//   no un síntoma que depende del timing de jsdom.
function DosPanelesConCierresEstables() {
  const [abiertoA, setAbiertoA] = useState(true);
  const [abiertoB, setAbiertoB] = useState(true);
  const closeA = useCallback(() => flushSync(() => setAbiertoA(false)), []);
  const closeB = useCallback(() => setAbiertoB(false), []);
  return (
    <>
      {abiertoA && (
        <ContextPanel title="Propiedades" onClose={closeA}>contenido A</ContextPanel>
      )}
      {abiertoB && (
        <ContextPanel title="Capas" onClose={closeB}>contenido B</ContextPanel>
      )}
    </>
  );
}

describe('ContextPanel', () => {
  it('renders the title and still closes on the button and Escape', () => {
    const onClose = vi.fn();
    render(<ContextPanel title="Avatar" onClose={onClose}>body</ContextPanel>);
    expect(screen.getByText('Avatar')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /cerrar panel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  // Dos ranuras independientes (usePanelHost) montan hasta dos ContextPanel
  // a la vez. El viejo "cierre por clic afuera" cerraba CUALQUIER panel con
  // cualquier mousedown fuera de SU PROPIO panelRef — con dos paneles vivos,
  // eso significaba que hacer clic dentro de uno cerraba el otro, y que
  // hacer clic en el lienzo (el gesto que abre Propiedades) los cerraba
  // ambos. Ese mecanismo se eliminó de ContextPanel.tsx; este test lo fija.
  //
  // Fake timers: el viejo listener se adjuntaba tras un setTimeout(100) (para
  // no cerrarse con el mismo clic que abrió el panel). Sin avanzar el reloj,
  // este test pasaría igual con el código viejo — no probaría nada.
  it('un mousedown dentro de un panel no cierra al otro panel', () => {
    vi.useFakeTimers();
    try {
      const onCloseA = vi.fn();
      const onCloseB = vi.fn();
      render(
        <>
          <ContextPanel title="Propiedades" onClose={onCloseA}>contenido A</ContextPanel>
          <ContextPanel title="Capas" onClose={onCloseB}>contenido B</ContextPanel>
        </>,
      );
      vi.advanceTimersByTime(200);
      fireEvent.mouseDown(screen.getByText('contenido A'));
      expect(onCloseB).not.toHaveBeenCalled();
      expect(onCloseA).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('Escape con dos paneles abiertos cierra los dos, no solo el izquierdo', () => {
    render(<DosPanelesConCierresEstables />);
    expect(screen.getByText('Propiedades')).toBeTruthy();
    expect(screen.getByText('Capas')).toBeTruthy();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.queryByText('Propiedades')).toBeNull();
    expect(screen.queryByText('Capas')).toBeNull();
  });
});
