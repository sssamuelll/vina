// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import PenToolOverlay from '../overlays/PenToolOverlay';

afterEach(cleanup);

const base = {
  zoom2D: 1,
  units: 'mm',
  penNodes: [],
  previewPath: '',
  guidePath: null,
  penWillClose: false,
};

function draw(
  penDistance: React.ComponentProps<typeof PenToolOverlay>['penDistance'],
  precisionHint = false,
) {
  return render(
    <svg>
      <PenToolOverlay {...base} penDistance={penDistance} precisionHint={precisionHint} />
    </svg>,
  );
}

describe('PenToolOverlay readout', () => {
  it('muestra largo, angulo relativo y referencia de borde con un decimal', () => {
    const { container } = draw({
      distance: 12.345,
      position: { x: 20, y: 30 },
      angleDeg: 75,
      reference: { kind: 'border', baseDeg: 30 },
    });
    expect(container.querySelector('.pen-distance-label text')?.textContent)
      .toContain('12.3 mm · 45.0° al borde');
  });

  it('conserva las fixtures antiguas que solo traen distancia y posicion', () => {
    const { container } = draw({ distance: 10, position: { x: 20, y: 30 } });
    expect(container.querySelector('.pen-distance-label text')?.textContent).toBe('10.0 mm');
  });

  it('muestra la pista y dimensiona la pildora desde el texto', () => {
    const short = draw({
      distance: 1,
      position: { x: 0, y: 0 },
      angleDeg: 0,
      reference: { kind: 'absolute', baseDeg: 0 },
    }, true);
    const shortWidth = Number(short.container.querySelector('.pen-distance-label rect')?.getAttribute('width'));
    expect(short.getByText('Tab · escribe la medida')).toBeTruthy();
    cleanup();

    const long = draw({
      distance: 123456,
      position: { x: 0, y: 0 },
      angleDeg: 179.9,
      reference: { kind: 'segment', baseDeg: 0 },
    });
    const longWidth = Number(long.container.querySelector('.pen-distance-label rect')?.getAttribute('width'));
    expect(longWidth).toBeGreaterThan(shortWidth);
  });

  // #1166 revisión adversarial: la pista se pintaba DEBAJO de la píldora, una
  // banda de ~150px que pasaba justo por donde cae el clic. Tiene que quedar
  // ENCIMA de la píldora y alineada a su mismo borde izquierdo (no centrada
  // sobre el cursor).
  it('la pista queda ENCIMA de la píldora, alineada a su borde izquierdo, nunca sobre ni debajo del cursor', () => {
    const { container } = draw({
      distance: 12.345,
      position: { x: 20, y: 30 },
      angleDeg: 75,
      reference: { kind: 'border', baseDeg: 30 },
    }, true);
    const pill = container.querySelector('.pen-distance-label rect')!;
    const hint = container.querySelector('text.precision-hint')!;
    const pillTop = Number(pill.getAttribute('y'));
    const pillLeft = Number(pill.getAttribute('x'));
    const hintY = Number(hint.getAttribute('y'));
    const hintX = Number(hint.getAttribute('x'));

    // Encima: el ancla de la pista no puede caer por debajo del borde
    // superior de la píldora (que YA está por encima del cursor: la píldora
    // vive en el grupo desplazado (+22,−18) del cursor).
    expect(hintY).toBeLessThan(pillTop);
    // Mismo borde izquierdo que la píldora — no centrada sobre el cursor.
    expect(hintX).toBeCloseTo(pillLeft, 6);
    expect(hint.getAttribute('text-anchor')).toBe('start');
    // El cursor real vive en local (−22, +18) dentro de este grupo (el
    // grupo se desplaza (+22,−18) respecto al cursor). La pista entera queda
    // por encima de la píldora, que ya queda por encima de esos +18: ninguna
    // parte de su caja contiene el punto del cursor ni cae por debajo de él.
    expect(hintY).toBeLessThan(18);
  });
});
