/**
 * Las dos métricas miden EL MISMO anillo — hallazgo del review adversarial
 * sobre el diff de la tanda 2a (#1029).
 *
 * v1 cierra siempre, porque envuelve el polígono aplanado. v2 cerraba solo
 * ante un comando `Z` explícito. Sobre un contorno cerrado al que le falta la
 * `Z`, eso no daba una diferencia de redondeo: daba dos contornos distintos —
 * v1 medía 400 donde v2 medía 300, y un piquete a 350mm aparecía en un borde
 * de la pieza según una métrica y en otro borde según la otra.
 *
 * La premisa de la tanda es que son dos formas de medir un contorno, no dos
 * contornos. Un subpath se cierra al llegar el siguiente `M` o el final del
 * comando, con o sin `Z`.
 */
import { describe, it, expect } from 'vitest';
import type { PathCommand } from '../../../types/types';
import { buildRing, projectToRing, pointAt } from '../outlineRing';
import { outlinePerimeter, resolveNotchAnchor } from '../../notchAnchor';

const ok = <T>(r: { ok: true; value: T } | { ok: false }): T => {
  if (!r.ok) throw new Error('se esperaba ok:true');
  return r.value;
};

// Un cuadrado 100×100 al que le falta la Z. Cerrado tiene 400 de perímetro.
const sinZ: PathCommand[] = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [100, 0] },
  { type: 'L', values: [100, 100] },
  { type: 'L', values: [0, 100] },
];
const conZ: PathCommand[] = [...sinZ, { type: 'Z', values: [] }];

describe('v2 cierra el contorno aunque falte la Z', () => {
  it('mide 400, no 300', () => {
    expect(ok(buildRing(sinZ, 2)).totalMm).toBeCloseTo(400, 9);
  });

  it('mide lo mismo que con la Z puesta', () => {
    expect(ok(buildRing(sinZ, 2)).totalMm).toBeCloseTo(ok(buildRing(conZ, 2)).totalMm, 9);
  });

  it('coincide con v1, que siempre cerró', () => {
    expect(ok(buildRing(sinZ, 2)).totalMm).toBeCloseTo(ok(buildRing(sinZ, 1)).totalMm, 9);
  });

  it('el punto a 350mm cae en el mismo borde que en v1, no en otro', () => {
    // El fallo real: v1 → (0,50), lado izquierdo. v2 → (50,0), lado de abajo,
    // porque 350 % 300 = 50. El piquete cambiaba de borde.
    const ancla = { refPoint: { x: 0, y: 0 }, direction: 'cw' as const, distanceMm: 350 };
    const v1 = resolveNotchAnchor(sinZ, ancla);
    const v2 = resolveNotchAnchor(sinZ, { ...ancla, metric: 2 as const });
    expect(v1).not.toBeNull();
    expect(v2).not.toBeNull();
    expect(v2!.point.x).toBeCloseTo(v1!.point.x, 6);
    expect(v2!.point.y).toBeCloseTo(v1!.point.y, 6);
  });

  it('se puede proyectar sobre el lado que la Z omitía', () => {
    // El tramo de vuelta (0,100)→(0,0) existe: un punto en su medio proyecta
    // a 350, no al lado más cercano de los otros tres.
    expect(projectToRing(ok(buildRing(sinZ, 2)), { x: 0, y: 50 }).distanceMm).toBeCloseTo(350, 6);
  });

  it('cada subpath cierra solo, sin puentear al siguiente', () => {
    // Dos cuadrados separados, ninguno con Z: 400 + 400, y NUNCA un tramo
    // que salte de uno a otro.
    const dos: PathCommand[] = [
      ...sinZ,
      { type: 'M', values: [500, 0] },
      { type: 'L', values: [600, 0] },
      { type: 'L', values: [600, 100] },
      { type: 'L', values: [500, 100] },
    ];
    const ring = ok(buildRing(dos, 2));
    expect(ring.subpathCount).toBe(2);
    expect(ring.totalMm).toBeCloseTo(800, 9);
    // Ningún punto del anillo cae en el hueco entre los dos cuadrados.
    for (let d = 0; d < ring.totalMm; d += 7) {
      const p = pointAt(ring, d).point;
      expect(p.x <= 100.001 || p.x >= 499.999, `puente en d=${d}: x=${p.x}`).toBe(true);
    }
  });

  it('no rompe el caso normal: con Z sigue midiendo lo mismo que antes', () => {
    expect(ok(buildRing(conZ, 2)).totalMm).toBeCloseTo(400, 9);
    expect(ok(buildRing(conZ, 1)).totalMm).toBe(outlinePerimeter(conZ));
  });
});

describe('el techo del modal se calcula con la métrica del ancla', () => {
  // `useNotchTool` pasaba SIEMPRE el perímetro v1 como tope de distancia. En
  // un contorno curvo v2 mide más, así que el modal rechazaba distancias de
  // cola que son válidas; y sobre el contorno sin Z de arriba aceptaba hasta
  // 400 un ancla que envolvía a 300.
  const curvo: PathCommand[] = [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [100, 0] },
    { type: 'C', values: [130, 60, 120, 140, 100, 200] },
    { type: 'L', values: [0, 200] },
    { type: 'Z', values: [] },
  ];

  it('sin argumento sigue dando la métrica vieja — no rompe a quien ya lo llama', () => {
    expect(outlinePerimeter(curvo)).toBe(outlinePerimeter(curvo, 1));
  });

  it('con métrica 2 da el perímetro preciso, que es MAYOR', () => {
    expect(outlinePerimeter(curvo, 2)).toBeCloseTo(ok(buildRing(curvo, 2)).totalMm, 9);
    expect(outlinePerimeter(curvo, 2)).toBeGreaterThan(outlinePerimeter(curvo, 1));
  });

  it('en un contorno con arco A cae a la métrica vieja en vez de dar NaN', () => {
    const conArco: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'A', values: [50, 50, 0, 0, 1, 100, 100] },
      { type: 'Z', values: [] },
    ];
    expect(outlinePerimeter(conArco, 2)).toBe(outlinePerimeter(conArco, 1));
  });
});
