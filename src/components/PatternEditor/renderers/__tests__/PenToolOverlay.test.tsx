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
});
