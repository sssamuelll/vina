import { describe, expect, it } from 'vitest';
import { SistemaTela } from '../sistema';
import { pasoImplicito } from '../paso';
import { distancia } from '../obstaculos';
import { CUSICK, escenaCusick, escenaVoladizo, laminaPlana, TELA_DE_LABORATORIO } from '../banco/escenas';
import { aplastados } from '../banco/medidas';
import { azar } from './ayudas';

describe('el paso implícito', () => {
  it('un paso nunca sube G, tampoco al chocar con el suelo', () => {
    const s = new SistemaTela(laminaPlana(10), TELA_DE_LABORATORIO, { obstaculos: [{ tipo: 'plano', altura: -0.004 }] });
    const r = azar(31);
    for (let q = 0; q < s.x.length; q++) s.x[q] += 0.002 * r();
    let anticipados = 0;
    for (let k = 0; k < 20; k++) {
      const info = pasoImplicito(s);
      expect(info.G1).toBeLessThanOrEqual(info.G0);
      anticipados += info.anticipados;
    }
    expect(anticipados).toBeGreaterThan(0);
  });

  it('el disco cae sobre el pedestal sin atravesarlo y sin aplastarse', () => {
    const e = escenaCusick(10);
    const s = new SistemaTela(e.malla, TELA_DE_LABORATORIO, { obstaculos: e.obstaculos });
    for (let k = 0; k < 60; k++) pasoImplicito(s);
    let dentro = 0, centro = 0, masCerca = Infinity;
    for (let i = 0; i < s.n; i++) {
      if (distancia(e.obstaculos[0], s.x[3 * i], s.x[3 * i + 1], s.x[3 * i + 2]).d < 0) dentro++;
      const r2 = e.malla.patron[2 * i] ** 2 + e.malla.patron[2 * i + 1] ** 2;
      if (r2 < masCerca) {
        masCerca = r2;
        centro = i;
      }
    }
    expect(dentro).toBe(0);
    expect(aplastados(s.x, e.malla)).toBeLessThan(0.1);
    // el centro quedó apoyado en la tapa, a la separación de contacto
    expect(s.x[3 * centro + 1] - CUSICK.tapa).toBeCloseTo(s.sep, 3);
  });

  it('los empotrados no se mueven ni un bit y la punta baja', () => {
    const e = escenaVoladizo(15, 'urdimbre', 5);
    const s = new SistemaTela(e.malla, TELA_DE_LABORATORIO, { hilo: e.hilo });
    for (let k = 0; k < 30; k++) pasoImplicito(s);
    for (let i = 0; i < s.n; i++) {
      if (!s.fijo[i]) continue;
      for (let d = 0; d < 3; d++) expect(s.x[3 * i + d]).toBe(e.malla.x[3 * i + d]);
    }
    let minY = 0;
    for (let i = 0; i < s.n; i++) minY = Math.min(minY, s.x[3 * i + 1]);
    expect(minY).toBeLessThan(-1e-4);
  });
});
