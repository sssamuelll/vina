// @vitest-environment jsdom
/**
 * #1068 — los avios se pintaban sin girar.
 *
 * `TrimRenderer` se monta en `PatternEditor.tsx:887`, dentro de
 * `data-pan-zoom-group`, que solo lleva pan y zoom: espacio de patron. Las
 * posiciones que dibuja son locales —`placement.positions` en modo `point`, y
 * `interpolateEdgePoint` en los demas, que muestrea `flattenPath(piece.outline)`—
 * y solo se les sumaba `piece.position`.
 *
 * Rectangulo, no cuadrado: un cuadrado girado 90 ocupa el mismo sitio.
 */
import { render } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { createElement } from 'react';
import type React from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';
import type { PatternPiece } from '../../../types/types';
import type { Trim } from '../../../types/trim';
import TrimRenderer from '../renderers/TrimRenderer';

/** 100 x 40 en local; centro del bbox (50, 20). */
const RECT = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [100, 0] },
  { type: 'L', values: [100, 40] },
  { type: 'L', values: [0, 40] },
  { type: 'Z', values: [] },
];

const pieza = (rotation: number) => ({
  id: 'p1', name: 'Delantero',
  outline: RECT.map(c => ({ ...c, values: [...c.values] })),
  position: { x: 0, y: 0 }, rotation,
  mirrored: false, seamAllowance: 0, internals: [],
}) as unknown as PatternPiece;

const BOTON = {
  id: 't1', pieceId: 'p1', type: 'button', name: 'Boton', description: '',
  placement: { mode: 'point', positions: [{ x: 10, y: 20 }] },
  material: 'resina', color: '#333', size: 12, unitCost: 0, active: true,
} as unknown as Trim;

function pintar(rotation: number) {
  const estado = { project: { trims: [BOTON], pieces: [pieza(rotation)] } };
  const store = configureStore({
    reducer: (s = estado) => s,
    preloadedState: estado,
  });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    createElement(Provider, { store, children });
  const { container } = render(
    createElement('svg', null, createElement(TrimRenderer, { zoom2D: 1 })),
    { wrapper },
  );
  return container.querySelector('circle')!;
}

describe('#1068 — los avios sobre una pieza girada', () => {
  it('coloca el boton donde su sitio se VE', () => {
    // Local (10,20) girado 90 sobre (50,20) se ve en (50,-20).
    const c = pintar(90);
    expect(c).not.toBeNull();
    expect(Number(c.getAttribute('cx'))).toBeCloseTo(50, 3);
    expect(Number(c.getAttribute('cy'))).toBeCloseTo(-20, 3);
  });

  it('sin rotacion se comporta igual que siempre', () => {
    const c = pintar(0);
    expect(Number(c.getAttribute('cx'))).toBeCloseTo(10, 3);
    expect(Number(c.getAttribute('cy'))).toBeCloseTo(20, 3);
  });
});
