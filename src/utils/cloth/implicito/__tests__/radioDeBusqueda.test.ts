import { describe, expect, it, vi } from 'vitest';
import * as contacto from '../contactoPropio';
import { armarPrenda } from '../prenda';
import { mallaDeContorno } from '../malla';
import { SistemaTela } from '../sistema';
import { rectangulo, TELA_DE_LABORATORIO } from '../banco/escenas';
import { azar } from './ayudas';

// el radio de cada triángulo solo elige qué puntos se miran: con uno de 5 cm la búsqueda es completa en estas escenas
vi.mock('../contactoPropio', async (importOriginal) => {
  const m = await importOriginal<typeof import('../contactoPropio')>();
  return { ...m, radioDeBusqueda: vi.fn(m.radioDeBusqueda) };
});
const radioDelMotor = vi.mocked(contacto.radioDeBusqueda).getMockImplementation()!;

function activos(s: SistemaTela): Set<string> {
  s.armarParesPropios();
  return new Set(s.paresPropios.filter((p) => p.activo).map((p) => p.v.join(',')));
}

describe('el radio de búsqueda del contacto propio', () => {
  for (const [nombre, empotrada] of [['tres capas sueltas', false], ['dos capas sobre una empotrada', true]] as const) {
    it(`no deja fuera ningún par que la búsqueda completa activa (${nombre})`, () => {
      // tres láminas de malla de 10 mm, a 3,5 y 7 mm de la de abajo, cada vértice a hasta 0,35 m/s por eje
      const capas = [0, 0.0035, 0.007].map((y, k) => mallaDeContorno(rectangulo(-40 + 7 * k, -40, 40, 40 - 7 * k), 10, y));
      const nAbajo = capas[0].x.length / 3;
      const prenda = armarPrenda(capas.map((c, k) => ({ id: `capa${k}`, ...c, ...(k === 0 && empotrada ? { fijos: new Uint8Array(nAbajo).fill(1) } : {}) })));
      const s = new SistemaTela(prenda.malla, TELA_DE_LABORATORIO);
      const r = azar(11);
      for (let i = 0; i < 3 * s.n; i++) s.v[i] = 0.7 * r();
      s.xt.set(s.x);
      const conElRadio = activos(s);
      vi.mocked(contacto.radioDeBusqueda).mockImplementation(() => 0.05);
      const completa = activos(s);
      vi.mocked(contacto.radioDeBusqueda).mockImplementation(radioDelMotor);
      const predichos = s.paresPropios.filter((p) => p.activo && p.p0 < 0).length;
      expect(predichos).toBeGreaterThan(0);
      expect([...completa].filter((k) => !conElRadio.has(k))).toEqual([]);
      expect(conElRadio.size).toBe(completa.size);
    });
  }
});
