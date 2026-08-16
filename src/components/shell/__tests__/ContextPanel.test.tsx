/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import ContextPanel from '../ContextPanel';

afterEach(cleanup);

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
});
