// @vitest-environment jsdom
/**
 * Las dos guías de Shift en el lienzo (spec 2026-09-23 § 4.1): la activa con
 * el acento, por donde va la línea; la tenue con la tinta de construcción,
 * adonde iría si se cambiara de guía ahora. Solo rayos: el punto y los ángulos
 * los decide `guiasShift`.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import GuiasShiftOverlay from '../GuiasShiftOverlay';

afterEach(cleanup);

const enSvg = (ui: React.ReactElement) => render(<svg>{ui}</svg>);

describe('GuiasShiftOverlay', () => {
  it('pinta la activa con el acento y la tenue con tinta de construcción', () => {
    const { container } = enSvg(
      <GuiasShiftOverlay
        zoom2D={2}
        guias={{
          punto: { x: 10, y: 0 },
          activa: { desde: { x: 0, y: 0 }, angleDeg: 0 },
          tenue: { desde: { x: 0, y: 0 }, angleDeg: 18 },
        }}
      />,
    );
    const activa = container.querySelector('[data-guia-shift="activa"]')!;
    const tenue = container.querySelector('[data-guia-shift="tenue"]')!;
    expect(activa.getAttribute('stroke')).toBe('var(--accent-2d)');
    expect(tenue.getAttribute('stroke')).toBe('var(--ink-on-light-3)');
    // Grosor compensado con el zoom, como el resto del lienzo.
    expect(activa.getAttribute('stroke-width')).toBe(String(1 / 2));
    expect(container.querySelector('g')!.getAttribute('pointer-events')).toBe('none');
    // Un rayo largo en píxeles de pantalla, pasado a patrón con el zoom.
    expect(Number(activa.getAttribute('x2'))).toBeCloseTo(2000 / 2, 6);
    expect(Number(activa.getAttribute('y2'))).toBeCloseTo(0, 6);
  });

  it('la tenue va debajo de la activa', () => {
    const { container } = enSvg(
      <GuiasShiftOverlay
        zoom2D={1}
        guias={{
          punto: { x: 10, y: 0 },
          activa: { desde: { x: 0, y: 0 }, angleDeg: 0 },
          tenue: { desde: { x: 0, y: 0 }, angleDeg: 18 },
        }}
      />,
    );
    const lineas = [...container.querySelectorAll('line')].map(l => l.getAttribute('data-guia-shift'));
    expect(lineas).toEqual(['tenue', 'activa']);
  });

  it('sin guías, o sin dirección, no pinta nada', () => {
    expect(enSvg(<GuiasShiftOverlay zoom2D={1} guias={null} />).container.querySelector('line')).toBeNull();
    expect(
      enSvg(<GuiasShiftOverlay zoom2D={1} guias={{ punto: { x: 0, y: 0 }, activa: null, tenue: null }} />)
        .container.querySelector('line'),
    ).toBeNull();
  });

  it('una sola guía cuando los marcos coinciden', () => {
    const { container } = enSvg(
      <GuiasShiftOverlay
        zoom2D={1}
        guias={{ punto: { x: 10, y: 0 }, activa: { desde: { x: 0, y: 0 }, angleDeg: 0 }, tenue: null }}
      />,
    );
    expect(container.querySelectorAll('line')).toHaveLength(1);
  });
});
