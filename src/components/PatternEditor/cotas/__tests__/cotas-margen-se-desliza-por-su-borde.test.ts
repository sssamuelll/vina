import { describe, it, expect } from 'vitest';
import { separarChips } from '../cotasGeometry';
import type { Cota } from '../cotas';

/**
 * Ronda de revisión adversarial del arreglo F4 (2026-09-04).
 *
 * El arreglo de los chips que se pisan desliza cada uno por la tangente de su
 * cota, y su justificación era: «el chip cae en el punto medio del hilo que
 * dibuja CotaLines, así que deslizarlo por el hilo lo mantiene encima».
 *
 * El revisor encontró el caso donde esa frase no se sostiene, y es justo el par
 * que de verdad convive: **el margen**. Su cota tiene `a === b`
 * (`cotaDeMargen.ts:48-49`) y `CotaLines.tsx:19` la deja fuera del hilo a
 * propósito, así que no hay tangente ni hay hilo — el respaldo horizontal
 * mandaba el chip 52 px de lado, sea cual sea la orientación del borde.
 *
 * Lo que sí sabe la cota de margen es su `outward`: la normal hacia fuera del
 * borde. Su perpendicular ES la dirección del borde, así que el chip se desliza
 * *a lo largo del borde del que habla*, que es lo que la frase prometía.
 *
 * El par real: `sujeto.ts` da como mucho un margen anclado (el que se clicó) y
 * la lectura del hover. Cuando se pisan, la lectura es la que cede.
 */

const margen = (id: string, punto: [number, number], outward: [number, number]): Cota => ({
  id, kind: 'margen', label: '9,5 mm', valueMm: 9.5, unit: 'mm', min: 0, max: 100, primary: true,
  a: { x: punto[0], y: punto[1] }, b: { x: punto[0], y: punto[1] },
  outward: { x: outward[0], y: outward[1] },
  apply: () => null,
});

/** Componente del desplazamiento a lo largo de `dir` y perpendicular a `dir`. */
function descomponer(antes: { left: number; top: number }, despues: { left: number; top: number }, dir: [number, number]) {
  const dx = despues.left - antes.left;
  const dy = despues.top - antes.top;
  const n = Math.hypot(dir[0], dir[1]);
  return {
    aLoLargo: Math.abs((dx * dir[0] + dy * dir[1]) / n),
    perpendicular: Math.abs((dx * -dir[1] + dy * dir[0]) / n),
  };
}

describe('el chip de margen se desliza por su borde, no por donde caiga', () => {
  it('en un borde VERTICAL (normal horizontal) el chip se aparta en vertical', () => {
    // outward = (1,0) → el borde corre en vertical → el chip debe subir o bajar.
    const items = [
      { cota: margen('m1', [300, 200], [1, 0]), left: 400, top: 300 },
      { cota: margen('m2', [300, 210], [1, 0]), left: 400, top: 300, cede: true },
    ];
    const salida = separarChips(items);
    for (let i = 0; i < items.length; i++) {
      const d = descomponer(items[i], salida[i], [0, 1]);
      expect(d.perpendicular, `el chip ${items[i].cota.id} se salió del borde`).toBeLessThan(0.001);
    }
  });

  it('en un borde HORIZONTAL (normal vertical) se aparta en horizontal', () => {
    const items = [
      { cota: margen('m1', [300, 200], [0, -1]), left: 400, top: 300 },
      { cota: margen('m2', [310, 200], [0, -1]), left: 400, top: 300, cede: true },
    ];
    const salida = separarChips(items);
    for (let i = 0; i < items.length; i++) {
      const d = descomponer(items[i], salida[i], [1, 0]);
      expect(d.perpendicular, `el chip ${items[i].cota.id} se salió del borde`).toBeLessThan(0.001);
    }
  });

  it('en un borde en diagonal, por la diagonal', () => {
    const raiz = Math.SQRT1_2;
    const items = [
      { cota: margen('m1', [300, 200], [raiz, -raiz]), left: 400, top: 300 },
      { cota: margen('m2', [305, 205], [raiz, -raiz]), left: 400, top: 300, cede: true },
    ];
    const salida = separarChips(items);
    for (let i = 0; i < items.length; i++) {
      const d = descomponer(items[i], salida[i], [raiz, raiz]);
      expect(d.perpendicular).toBeLessThan(0.001);
    }
  });

  it('y de todas formas dejan de pisarse', () => {
    const items = [
      { cota: margen('m1', [300, 200], [1, 0]), left: 400, top: 300 },
      { cota: margen('m2', [300, 210], [1, 0]), left: 400, top: 300, cede: true },
    ];
    const s = separarChips(items);
    const distancia = Math.hypot(s[0].left - s[1].left, s[0].top - s[1].top);
    expect(distancia, 'siguen uno encima del otro').toBeGreaterThan(20);
  });

  it('con `outward` degenerado sigue habiendo un respaldo, no un NaN', () => {
    const items = [
      { cota: margen('m1', [300, 200], [0, 0]), left: 400, top: 300 },
      { cota: margen('m2', [300, 210], [0, 0]), left: 400, top: 300 },
    ];
    for (const p of separarChips(items)) {
      expect(Number.isFinite(p.left) && Number.isFinite(p.top)).toBe(true);
    }
  });
});
