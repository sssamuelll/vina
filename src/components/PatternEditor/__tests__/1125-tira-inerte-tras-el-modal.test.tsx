// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { store } from '../../../store';
import ToolStrip2D from '../ToolStrip2D';

afterEach(cleanup);

/**
 * Issue #1125 — «la tira de opciones 2D sigue alcanzable por teclado detrás
 * del modal de piquete».
 *
 * Medido en la revisión adversarial del 2026-09-04: `NotchPrecisionModal` no
 * usa `createPortal`, no atrapa el foco y no marca nada como inerte
 * (`NotchPrecisionModal.tsx:48-64` solo escucha Enter/Escape en captura).
 * La tira sigue montada debajo, en la MISMA esquina (las dos declaran
 * `top:28px; right:12px`), así que Shift+Tab desde el campo con autofoco lleva
 * el foco a controles invisibles y las flechas pueden cambiar una opción sin
 * ninguna superficie que lo muestre.
 *
 * Lo que este arreglo NO es: subir el modal a `--z-modal`. Esa capa se decidió
 * a la baja a propósito —el propio archivo dice «deliberately no scrim»— y
 * `src/styles/__tests__/zIndexScale.test.ts` la fija con esa razón escrita.
 * El defecto es de FOCO, no de pintado, y se arregla donde está: la tira se
 * declara inerte mientras haya un modal encima.
 *
 * Ver docs/reports/2026-09-04-revision-adversarial-ui.md § 2 F9.
 */

const pintar = (props: Partial<{ lineaDeSujeto: string | null; inerte: boolean }> = {}) =>
  render(
    <Provider store={store}>
      <ToolStrip2D lineaDeSujeto={props.lineaDeSujeto ?? null} inerte={props.inerte ?? false} />
    </Provider>,
  );

describe('#1125 — la tira no recibe foco cuando hay un modal encima', () => {
  it('en reposo, la tira es alcanzable por teclado', () => {
    const { container } = pintar();
    const tira = container.querySelector('.tool-strip');
    expect(tira, 'la tira no se pintó').not.toBeNull();
    expect(tira!.hasAttribute('inert'), 'la tira nace inerte y no debería').toBe(false);
  });

  it('con el modal abierto, la tira queda inerte', () => {
    const { container } = pintar({ inerte: true });
    const tira = container.querySelector('.tool-strip');
    expect(tira, 'la tira no se pintó').not.toBeNull();
    expect(tira!.hasAttribute('inert'), 'la tira sigue siendo alcanzable por teclado').toBe(true);
  });

  it('inerte también la saca del árbol de accesibilidad', () => {
    // `inert` ya implica aria-hidden en los navegadores que lo soportan, pero
    // jsdom no lo simula: lo que se fija aquí es que el atributo esté puesto en
    // el CONTENEDOR, no en cada botón (que se olvidaría uno).
    const { container } = pintar({ inerte: true });
    const botones = container.querySelectorAll('.tool-strip button');
    for (const b of botones) {
      expect(b.closest('[inert]'), 'hay un botón fuera del subárbol inerte').not.toBeNull();
    }
  });
});
