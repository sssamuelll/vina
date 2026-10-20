// @vitest-environment jsdom
/**
 * Los dos menús del 3D también son peldaños de la escalera de lo que se llama
 * (spec 2026-10-02 § 6.2): con la barra de IA convocada, un Escape cierra el
 * menú y nada más. Cada uno escuchaba Escape por su cuenta: el del clic
 * derecho en `document`, detrás de ShortcutProvider, así que el mismo Escape
 * cerraba el menú y además ocultaba la barra; «Texturizado» en `window`, que
 * no llegaba a oírlo.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { store } from '../../../store';
import { ShortcutProvider } from '../../../shortcuts/ShortcutProvider';
import { subirPeldano } from '../../../shortcuts/escaleraDeLoLlamado';
import SurfaceModePill from '../SurfaceModePill';
import ContextMenu3D from '../ContextMenu3D';

let bajarIA: (() => void) | null = null;
afterEach(() => { bajarIA?.(); bajarIA = null; cleanup(); });

/** La barra de IA convocada: su peldaño, como lo sube UnifiedBar. */
function convocarIA() {
  const alEscape = vi.fn();
  bajarIA = subirPeldano('ia', 'ia', alEscape);
  return alEscape;
}

const escape = () => act(() => {
  (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
});

describe('los menús del 3D en la escalera', () => {
  it('«Texturizado»: el Escape cierra el menú y la barra de IA sigue; el siguiente es de la barra', () => {
    const alEscapeIA = convocarIA();
    render(<Provider store={store}><ShortcutProvider><SurfaceModePill /></ShortcutProvider></Provider>);
    fireEvent.click(screen.getByRole('button', { name: /^modo de superficie:/i }));
    expect(screen.queryByRole('group', { name: 'Modo de superficie' }), 'el caso no se ejerce').not.toBeNull();
    escape();
    expect(screen.queryByRole('group', { name: 'Modo de superficie' })).toBeNull();
    expect(alEscapeIA).not.toHaveBeenCalled();
    escape();
    expect(alEscapeIA).toHaveBeenCalledTimes(1);
  });

  it('el clic derecho: el Escape cierra el menú y la barra de IA sigue', () => {
    const alEscapeIA = convocarIA();
    const onClose = vi.fn();
    render(
      <Provider store={store}>
        <ShortcutProvider>
          <ContextMenu3D menu={{ visible: true, x: 10, y: 10, target: 'background' }} onClose={onClose} />
        </ShortcutProvider>
      </Provider>,
    );
    escape();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(alEscapeIA, 'el Escape del menú ocultó también la barra').not.toHaveBeenCalled();
  });
});
