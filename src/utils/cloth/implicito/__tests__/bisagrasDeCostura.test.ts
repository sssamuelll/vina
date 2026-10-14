import { describe, expect, it } from 'vitest';
import { bisagrasDeCostura, puntosDeCostura } from '../costuras';
import { armarPrenda } from '../prenda';
import { mallaDeContorno } from '../malla';
import { Placa } from '../placa';
import { SistemaTela } from '../sistema';
import { pasoImplicito } from '../paso';
import { telaSI } from '../tela';
import { rectangulo, TELA_DE_LABORATORIO } from '../banco/escenas';
import { borde, curvar } from './ayudas';

const R = 0.05;
const tela = telaSI(TELA_DE_LABORATORIO);

/** La lámina de 120 × 120 mm de placa.test.ts, cortada al medio (x = 0) en dos piezas cosidas, ya juntas. */
function laminaCosida(arista: number) {
  const izq = mallaDeContorno(rectangulo(-60, -60, 0, 60), arista), der = mallaDeContorno(rectangulo(0, -60, 60, 60), arista);
  const prenda = armarPrenda([{ id: 'i', ...izq }, { id: 'd', ...der }]);
  return { prenda, ladoA: borde(izq, 0), ladoB: borde(der, 0, izq.x.length / 3) };
}

describe('la flexión que cruza la costura', () => {
  it('una bisagra por cada arista cosida de A, con su ala en B y rigidez positiva', () => {
    const { prenda, ladoA, ladoB } = laminaCosida(5);
    const bis = bisagrasDeCostura(prenda.malla.patron, prenda.malla.tris, ladoA, ladoB, tela);
    expect(bis.length).toBe(ladoA.length - 1);
    const enB = new Set<number>();
    for (let i = ladoA.length; i < prenda.malla.x.length / 3; i++) enB.add(i);
    for (const b of bis) {
      expect(enB.has(b.d)).toBe(true);
      expect(b.kh).toBeGreaterThan(0);
    }
  });

  const casos = [
    ['a través de la costura', [1, 0], tela.bTrama],
    ['a lo largo de la costura', [0, 1], tela.bUrdimbre],
  ] as const;
  for (const [nombre, dir, B] of casos) {
    it(`lámina cosida curvada ${nombre}, malla de 5 mm: entre 0,85 y 1,05 de la energía exacta`, () => {
      const { prenda, ladoA, ladoB } = laminaCosida(5);
      const placa = new Placa(prenda.malla.patron, prenda.malla.tris, tela, {
        costura: bisagrasDeCostura(prenda.malla.patron, prenda.malla.tris, ladoA, ladoB, tela),
      });
      const x = curvar(prenda.malla, dir, R), exacta = 0.5 * B * (1 / R) ** 2 * 0.12 * 0.12;
      const sinCoser = placa.energia(x) / exacta;
      placa.activarCosturas();
      const cosida = placa.energia(x) / exacta;
      expect(cosida).toBeGreaterThan(0.85);
      expect(cosida).toBeLessThan(1.05);
      // a través de la costura, sin la bisagra falta la energía de la franja de la orilla
      if (dir[0] === 1) expect(cosida).toBeGreaterThan(sinCoser);
    });
  }

  it('en la prenda, las bisagras se encienden cuando la costura cierra', () => {
    const izq = mallaDeContorno(rectangulo(0, 0, 100, 60), 10), der = mallaDeContorno(rectangulo(0, 0, 100, 60), 10);
    const prenda = armarPrenda([
      { id: 'i', ...izq },
      { id: 'd', ...der, x: Float64Array.from(der.x, (q, k) => (k % 3 === 0 ? q + 0.13 : q)) },
    ]);
    const ladoA = borde(izq, 0.1), ladoB = borde(der, 0, izq.x.length / 3);
    const bisagras = bisagrasDeCostura(prenda.malla.patron, prenda.malla.tris, ladoA, ladoB, tela);
    const s = new SistemaTela(prenda.malla, TELA_DE_LABORATORIO, {
      costuras: { puntos: puntosDeCostura(prenda.malla.patron, ladoA, ladoB), bisagras },
      ajustes: { gravedad: 0 },
    });
    expect(s.placa.costura.every((c) => s.placa.K[c.o] === 0)).toBe(true);
    for (let c = 0; c < 60 && !s.costuras.cerradas(); c++) pasoImplicito(s);
    expect(s.costuras.cerradas()).toBe(true);
    expect(s.placa.costura.length).toBe(bisagras.length);
    expect(s.placa.costura.every((c) => s.placa.K[c.o] === c.kh)).toBe(true);
  });
});
