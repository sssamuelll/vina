import { describe, expect, it } from 'vitest';
import { SistemaTela } from '../sistema';
import { pasoImplicito } from '../paso';
import { medirQuietud, VigiaDeQuietud } from '../quietud';
import { escenaCusick, escenaVoladizo, laminaPlana, TELA_DE_LABORATORIO } from '../banco/escenas';

describe('el medidor de quietud', () => {
  it('marca cero en un equilibrio construido: una lámina apoyada en el suelo', () => {
    const s = new SistemaTela(laminaPlana(20), TELA_DE_LABORATORIO, { obstaculos: [{ tipo: 'plano', altura: 0 }] });
    // cada vértice a la altura en la que el contacto aguanta justo su peso
    for (let i = 0; i < s.n; i++) s.x[3 * i + 1] = s.sep - (s.masa[i] * -s.aj.gravedad) / s.aj.kContacto;
    pasoImplicito(s);
    expect(medirQuietud(s).total).toBeLessThan(1e-4);
  });

  it('marca un cuadro de caída libre cuando la tela empieza a caer', () => {
    const s = new SistemaTela(laminaPlana(20), TELA_DE_LABORATORIO);
    pasoImplicito(s);
    // un cuadro de Euler implícito con aire desde el reposo: v = g·h / (1 + aire·h)
    expect(medirQuietud(s).total).toBeCloseTo(1 / (1 + s.aj.aire * s.aj.h), 3);
  });

  it('los empotrados no cuentan', () => {
    const e = escenaVoladizo(15, 'urdimbre', 5);
    const s = new SistemaTela(e.malla, TELA_DE_LABORATORIO, { hilo: e.hilo });
    for (let i = 0; i < s.n; i++) if (s.fijo[i]) s.vPedida[3 * i + 1] = 1;
    expect(medirQuietud(s).total).toBe(0);
  });

  it('una tela trabada no cuenta como quieta: el medidor mira la velocidad que pide el paso', () => {
    // con poca resistencia a encoger, la malla de 20 mm se aplasta, un triángulo se invierte y la búsqueda en
    // línea rechaza el paso entero (α = 0): la tela queda congelada en el aire, pero sigue pidiendo moverse
    const e = escenaCusick(20);
    const s = new SistemaTela(e.malla, { ...TELA_DE_LABORATORIO, pandeo: 0.2 }, { obstaculos: e.obstaculos });
    let trabados = 0;
    for (let c = 0; c < 45; c++) if (pasoImplicito(s).alfa === 0) trabados++;
    expect(trabados).toBeGreaterThan(0);
    expect(medirQuietud(s).total).toBeGreaterThan(1e-3);
  });

  it('el vigía pide 30 cuadros seguidos bajo el umbral', () => {
    const v = new VigiaDeQuietud();
    for (let k = 0; k < 29; k++) expect(v.registrar(5e-4)).toBe(false);
    expect(v.registrar(5e-4)).toBe(true);
    expect(v.registrar(2e-3)).toBe(false);
  });
});
