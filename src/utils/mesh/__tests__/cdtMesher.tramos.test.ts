import { describe, expect, test } from 'vitest';
import type { PathCommand, PatternPiece } from '../../../types/types';
import { meshPiece, type TramoDelBorde } from '../cdtMesher';

function pieza(outline: PathCommand[]): PatternPiece {
  return {
    id: 'p', name: 'p', outline, internals: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false,
    seamAllowance: 0, layer: 1, sublayer: 0, active: true, createdAt: 0, updatedAt: 0,
  };
}

const RECTANGULO: PathCommand[] = [
  { type: 'M', values: [0, 0] }, { type: 'L', values: [100, 0] }, { type: 'L', values: [100, 50] }, { type: 'L', values: [0, 50] },
  { type: 'Z', values: [] },
];

/** Los lugares en el contorno (boundaryOrig) de los vértices de borde entre `desde` y `hasta`, ordenados. */
function enElBorde(orig: ArrayLike<number>, desde: number, hasta: number): number[] {
  return Array.from(orig).filter((o) => Number.isFinite(o) && o >= desde - 1e-9 && o <= hasta + 1e-9).sort((a, b) => a - b);
}

describe('el mallador con tramos del borde', () => {
  // el borde de abajo del rectángulo es el tramo 0→1 del contorno aplanado
  const xs = [0, 7, 19, 31, 50, 64, 80, 100];
  const tramo: TramoDelBorde = { desde: 0, hasta: 1, puntos: xs.map((x) => ({ x, y: 0, orig: x / 100 })) };

  test('los vértices de un tramo son sus puntos, y el resto del borde se parte como siempre', () => {
    const m = meshPiece(pieza(RECTANGULO), { maxEdgeLength: 20 }, undefined, [tramo]);
    expect(m.triIds.length).toBeGreaterThan(0);
    const orig = m.boundaryOrig!;
    for (const [o, x] of enElBorde(orig, 0, 1).map((o, k) => [o, xs[k]])) expect(o).toBeCloseTo(x / 100, 9);
    expect(enElBorde(orig, 0, 1)).toHaveLength(xs.length);
    // el de arriba (2→3), sin tramo: 100 mm a 20 mm, cinco tramos
    expect(enElBorde(orig, 2, 3)).toHaveLength(6);
  });

  test('sin tramos, la malla no cambia', () => {
    const a = meshPiece(pieza(RECTANGULO), { maxEdgeLength: 20 });
    const b = meshPiece(pieza(RECTANGULO), { maxEdgeLength: 20 }, undefined, []);
    expect(Array.from(b.vertices)).toEqual(Array.from(a.vertices));
    expect(Array.from(b.triIds)).toEqual(Array.from(a.triIds));
  });

  test('un contorno al revés (que el mallador da vuelta) guarda sus tramos', () => {
    const alReves: PathCommand[] = [
      { type: 'M', values: [0, 0] }, { type: 'L', values: [0, 50] }, { type: 'L', values: [100, 50] }, { type: 'L', values: [100, 0] },
      { type: 'Z', values: [] },
    ];
    // el borde de abajo es ahora el tramo 3→4 (de x = 100 a x = 0)
    const puntos = [...xs].reverse().map((x) => ({ x, y: 0, orig: 3 + (100 - x) / 100 }));
    const m = meshPiece(pieza(alReves), { maxEdgeLength: 20 }, undefined, [{ desde: 3, hasta: 4, puntos }]);
    expect(m.triIds.length).toBeGreaterThan(0);
    const abajo = enElBorde(m.boundaryOrig!, 3, 4);
    // el punto de x = 0 es el del cierre: su lugar es el 0 del contorno, no el 4
    expect(abajo.length + enElBorde(m.boundaryOrig!, 0, 0).length).toBe(xs.length);
    for (const p of puntos.slice(0, -1)) expect(abajo.some((o) => Math.abs(o - p.orig) < 1e-9)).toBe(true);
  });

  test('un contorno de más de 200 puntos, que el mallador simplifica, guarda los puntos del tramo', () => {
    // un círculo de 300 lados: la simplificación se queda con unos pocos; el tramo va del 10 al 40
    const lados = 300, r = 100;
    const circulo: PathCommand[] = [{ type: 'M', values: [r, 0] }];
    for (let k = 1; k < lados; k++) circulo.push({ type: 'L', values: [r * Math.cos((2 * Math.PI * k) / lados), r * Math.sin((2 * Math.PI * k) / lados)] });
    circulo.push({ type: 'Z', values: [] });
    const punto = (o: number) => {
      const k = Math.floor(o), f = o - k, a = (2 * Math.PI * k) / lados, b = (2 * Math.PI * (k + 1)) / lados;
      return { x: r * ((1 - f) * Math.cos(a) + f * Math.cos(b)), y: r * ((1 - f) * Math.sin(a) + f * Math.sin(b)), orig: o };
    };
    const puntos = Array.from({ length: 11 }, (_, k) => punto(10 + 3 * k));
    const m = meshPiece(pieza(circulo), { maxEdgeLength: 15 }, undefined, [{ desde: 10, hasta: 40, puntos }]);
    expect(m.triIds.length).toBeGreaterThan(0);
    const tramo = enElBorde(m.boundaryOrig!, 10, 40);
    expect(tramo).toHaveLength(puntos.length);
    for (const [k, o] of tramo.entries()) expect(o).toBeCloseTo(puntos[k].orig, 6);
  });
});
