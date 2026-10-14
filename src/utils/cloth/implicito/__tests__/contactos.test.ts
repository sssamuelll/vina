import { describe, expect, it } from 'vitest';
import { buildLinearBVH } from '../../gpu/bvh';
import { energiaDePlano, EPS_FRICCION, rigidezDeFriccion } from '../contactos';
import { CuerpoRigido } from '../cuerpo';
import { SistemaTela } from '../sistema';
import { pasoImplicito } from '../paso';
import { medirQuietud, VigiaDeQuietud } from '../quietud';
import { separacion, telaSI } from '../tela';
import { aplastados } from '../banco/medidas';
import { esferaDeColision, laminaPlana, planoDeColision, TELA_DE_LABORATORIO } from '../banco/escenas';
import { azar, errorDelGradiente } from './ayudas';

describe('el contacto es un plano, con fricción', () => {
  it('la energía del plano: nada afuera, cuadrática adentro, y la fricción en el plano', () => {
    const c = { i: 0, nx: 0, ny: 1, nz: 0, p0: 0.001, kt: 50 };
    expect(energiaDePlano(c, 2000, 0, 0.002, 0)).toBe(0);
    expect(energiaDePlano(c, 2000, 0, 0.0005, 0)).toBeCloseTo(0.5 * 2000 * 0.0005 ** 2, 15);
    expect(energiaDePlano(c, 2000, 0.003, 0.002, 0)).toBeCloseTo(0.5 * 50 * 0.003 ** 2, 15);
  });

  it('el resorte de la fricción: μ·λ sobre la velocidad del cuadro anterior, con piso ε_v', () => {
    expect(rigidezDeFriccion(0.4, 2, 0.5, 1 / 60)).toBeCloseTo((0.4 * 2) / (0.5 / 60), 9);
    expect(rigidezDeFriccion(0.4, 2, 0, 1 / 60)).toBeCloseTo((0.4 * 2) / (EPS_FRICCION / 60), 6);
    expect(rigidezDeFriccion(0, 2, 0.5, 1 / 60)).toBe(0);
    expect(rigidezDeFriccion(0.4, 0, 0.5, 1 / 60)).toBe(0);
  });

  it('residuo = −∂G/∂x con planos y fricción, cerca de x_t (diferencias finitas)', () => {
    const s = new SistemaTela(laminaPlana(20), TELA_DE_LABORATORIO, { obstaculos: [{ tipo: 'plano', altura: 0 }] });
    const r = azar(61);
    // todos los vértices entre 0,5 y 1 mm del suelo: dentro de la separación (1,25 mm), con velocidad
    for (let i = 0; i < s.n; i++) {
      s.x[3 * i + 1] = 0.00075 + 0.0005 * r();
      for (let d = 0; d < 3; d++) s.v[3 * i + d] = 0.05 * r();
    }
    s.xt.set(s.x);
    s.armarContactos();
    expect(s.contactos.length).toBe(s.n);
    expect(s.contactos.every((c) => c.kt > 0)).toBe(true);
    // un poco fuera de x_t, sin salir de ningún plano
    for (let q = 0; q < s.x.length; q++) s.x[q] += 1e-5 * r();
    s.linealizar();
    const res = new Float64Array(s.x.length);
    s.residuo(res);
    expect(errorDelGradiente((x) => s.energiaIncremental(x), res.map((q) => -q), s.x)).toBeLessThan(1e-4);
  });

  it('la tela cae 5 cm sobre una esfera: no la atraviesa, no rebota y queda quieta', () => {
    const R = 0.1;
    const cuerpo = new CuerpoRigido(buildLinearBVH(esferaDeColision(R, 4)));
    const m = laminaPlana(10);
    m.x = Float64Array.from(m.x, (q, k) => (k % 3 === 1 ? q + R + 0.05 : q));
    const s = new SistemaTela(m, TELA_DE_LABORATORIO, { obstaculos: [{ tipo: 'cuerpo', cuerpo }] });
    let centro = 0;
    for (let i = 0; i < s.n; i++) if (Math.hypot(m.patron[2 * i], m.patron[2 * i + 1]) < Math.hypot(m.patron[2 * centro], m.patron[2 * centro + 1])) centro = i;
    const vigia = new VigiaDeQuietud();
    let masCerca = Infinity, subida = 0, toco = false, quieta = -1;
    for (let c = 0; c < 600 && quieta < 0; c++) {
      const info = pasoImplicito(s);
      expect(info.G1).toBeLessThanOrEqual(info.G0);
      for (let i = 0; i < s.n; i++) masCerca = Math.min(masCerca, Math.hypot(s.x[3 * i], s.x[3 * i + 1], s.x[3 * i + 2]) - R);
      if (Math.hypot(s.x[3 * centro], s.x[3 * centro + 1], s.x[3 * centro + 2]) - R < 2 * s.sep) toco = true;
      if (toco) subida = Math.max(subida, s.v[3 * centro + 1]);
      if (vigia.registrar(medirQuietud(s).total)) quieta = c;
    }
    // nunca más de 1 mm dentro de la separación, sin rebote, quieta en menos de 10 s y sin aplastar
    expect(masCerca).toBeGreaterThan(s.sep - 0.001);
    expect(subida).toBeLessThan(0.05);
    expect(quieta).toBeGreaterThan(0);
    expect(aplastados(s.x, m)).toBeLessThan(0.1);
  });

  for (const [grados, cuadros, desliza] of [[15, 60, false], [35, 30, true]] as const) {
    it(`sobre un plano a ${grados}° con μ = ${TELA_DE_LABORATORIO.friccionCuerpo}, la tela ${desliza ? 'se desliza' : 'se sostiene'}`, () => {
      const th = (grados * Math.PI) / 180;
      const n = [0, Math.cos(th), Math.sin(th)] as const, abajo = [0, -Math.sin(th), Math.cos(th)];
      const cuerpo = new CuerpoRigido(buildLinearBVH(planoDeColision(n, 4)));
      const m = laminaPlana(10), sep = separacion(telaSI(TELA_DE_LABORATORIO));
      // el parche apoyado en el plano, a la separación: (u, w) del dibujo → u·x̂ + w·abajo + sep·n
      m.x = Float64Array.from({ length: m.x.length }, (_, k) => {
        const i = Math.floor(k / 3), d = k % 3, u = m.patron[2 * i], w = m.patron[2 * i + 1];
        return (d === 0 ? u : 0) + w * abajo[d] + sep * n[d];
      });
      const s = new SistemaTela(m, TELA_DE_LABORATORIO, { obstaculos: [{ tipo: 'cuerpo', cuerpo }] });
      const avance = () => {
        let a = 0;
        for (let i = 0; i < s.n; i++) a += s.x[3 * i + 1] * abajo[1] + s.x[3 * i + 2] * abajo[2];
        return a / s.n;
      };
      const a0 = avance();
      for (let c = 0; c < cuadros; c++) pasoImplicito(s);
      if (desliza) expect(avance() - a0).toBeGreaterThan(0.02);
      else expect(avance() - a0).toBeLessThan(0.002);
    });
  }
});
