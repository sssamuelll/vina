import { describe, expect, it } from 'vitest';
import { SistemaTela } from '../sistema';
import { laminaPlana, TELA_DE_LABORATORIO } from '../banco/escenas';
import { azar, errorDelGradiente } from './ayudas';

describe('el sistema de un cuadro', () => {
  it('residuo = −∂G/∂x con inercia, aire y elástica (diferencias finitas)', () => {
    const s = new SistemaTela(laminaPlana(20), TELA_DE_LABORATORIO);
    const r = azar(21);
    for (let q = 0; q < s.x.length; q++) {
      s.x[q] += 0.003 * r();
      s.xt[q] = s.x[q] + 0.001 * r();
      s.v[q] = 0.2 * r();
    }
    s.linealizar();
    const res = new Float64Array(s.x.length);
    s.residuo([], res);
    expect(errorDelGradiente((x) => s.energiaIncremental(x), res.map((q) => -q), s.x)).toBeLessThan(1e-4);
  });

  it('al empezar el paso, el contacto entra con su normal', () => {
    const s = new SistemaTela(laminaPlana(20), TELA_DE_LABORATORIO, { obstaculos: [{ tipo: 'plano', altura: 0 }] });
    const r = azar(23);
    // ±0,25 mm: todos los vértices quedan a menos de la separación del suelo (1,25 mm)
    for (let q = 0; q < s.x.length; q++) s.x[q] += 0.0005 * r();
    s.xt.set(s.x);
    s.linealizar();
    const contactos = s.contactosActuales();
    expect(contactos.length).toBe(s.n);
    const res = new Float64Array(s.x.length);
    s.residuo(contactos, res);
    expect(errorDelGradiente((x) => s.energiaIncremental(x), res.map((q) => -q), s.x)).toBeLessThan(1e-4);
  });

  it('los empotrados no reciben fuerza ni contacto', () => {
    const m = laminaPlana(20);
    m.fijos = new Uint8Array(m.x.length / 3);
    m.fijos[0] = 1;
    const s = new SistemaTela(m, TELA_DE_LABORATORIO, { obstaculos: [{ tipo: 'plano', altura: 0 }] });
    s.linealizar();
    const res = new Float64Array(s.x.length);
    s.residuo(s.contactosActuales(), res);
    expect([res[0], res[1], res[2]]).toEqual([0, 0, 0]);
    expect(s.contactosActuales().some((c) => c.i === 0)).toBe(false);
  });
});
