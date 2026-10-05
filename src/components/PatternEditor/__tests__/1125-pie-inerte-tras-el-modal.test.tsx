// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { store } from '../../../store';
import { setActiveTool } from '../../../store/editorSlice';
import SeccionDelPatron from '../SeccionDelPatron';

afterEach(cleanup);

/**
 * Issue #1125 — «la tira de opciones 2D sigue alcanzable por teclado detrás
 * del modal de piquete».
 *
 * `NotchPrecisionModal` no usa `createPortal`, no atrapa el foco y no marca
 * nada como inerte. Hasta P2b la tarjeta vivía debajo, en su misma esquina, y
 * Shift+Tab desde el campo del modal llevaba el foco a controles invisibles.
 * Desde P2b las opciones viven en la línea al pie, a la vista, pero el modal
 * sigue sin atrapar el foco hasta que P3 lo borre: con él abierto, la sección
 * del patrón se declara inerte y nadie cambia una opción del piquete por
 * debajo del que se está ajustando.
 *
 * Ver docs/reports/2026-09-04-revision-adversarial-ui.md § 2 F9.
 */
const pintar = (inerte: boolean) => {
  store.dispatch(setActiveTool('notch'));
  return render(
    <Provider store={store}>
      <SeccionDelPatron frase={null} inerte={inerte} />
    </Provider>,
  );
};

describe('#1125 — la sección del patrón no recibe foco cuando hay un modal encima', () => {
  it('en reposo es alcanzable por teclado', () => {
    const seccion = pintar(false).container.querySelector('.seccion-del-patron');
    expect(seccion, 'la sección no se pintó').not.toBeNull();
    expect(seccion!.hasAttribute('inert'), 'la sección nace inerte y no debería').toBe(false);
  });

  it('con el modal abierto queda inerte', () => {
    const seccion = pintar(true).container.querySelector('.seccion-del-patron');
    expect(seccion!.hasAttribute('inert'), 'la sección sigue alcanzable por teclado').toBe(true);
  });

  it('inerte en el contenedor, no en cada botón: no se olvida ninguno', () => {
    // `inert` implica aria-hidden en los navegadores, pero jsdom no lo simula:
    // lo que se fija es que el atributo esté en el CONTENEDOR. Con el piquete
    // hay botones de verdad (sus formas), así que el recorrido no pasa vacío.
    const botones = pintar(true).container.querySelectorAll('.seccion-del-patron button');
    expect(botones.length, 'sin botones el test pasaría en vacío').toBeGreaterThan(0);
    for (const b of botones) {
      expect(b.closest('[inert]'), 'hay un botón fuera del subárbol inerte').not.toBeNull();
    }
  });
});
