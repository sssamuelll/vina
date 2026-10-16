import { describe, expect, it } from 'vitest';
import { SistemaTela } from '../../sistema';
import { escenaCusick, escenaEsfera, TELA_DE_LABORATORIO } from '../../banco/escenas';
import { empaquetar } from '../empaquetar';
import { distribuir, ENTRADAS, tamanosDeBufer, wgslDelMotor, wgslObstaculos } from '../wgsl';

describe('el WGSL del motor', () => {
  const e = escenaCusick(20);
  const s = new SistemaTela(e.malla, TELA_DE_LABORATORIO, { obstaculos: e.obstaculos });
  const p = empaquetar(s);
  const fuente = wgslDelMotor(s, p, distribuir(p, 60));

  it('declara cada entrada que despacha el motor', () => {
    for (const nombre of ENTRADAS) expect(fuente).toMatch(new RegExp(`fn ${nombre}\\(`));
  });

  it('no escribe constantes infinitas ni NaN', () => {
    expect(fuente).not.toMatch(/Infinity|NaN/);
  });

  it('la búsqueda en línea no consulta el obstáculo: del apoyo solo cuenta su fricción (E10)', () => {
    const cuerpo = fuente.slice(fuente.indexOf('fn posPrueba('), fuente.indexOf('fn anguloPrueba('));
    expect(cuerpo).not.toMatch(/masCercano/);
    expect(cuerpo).toMatch(/energiaFriccion/);
  });

  it('con un cuerpo, el obstáculo es el BVH recorrido hasta el radio de búsqueda', () => {
    const e = escenaEsfera();
    const sc = new SistemaTela(e.malla, TELA_DE_LABORATORIO, { obstaculos: e.obstaculos, ajustes: { contactoPropio: false } });
    const pc = empaquetar(sc), fc = wgslDelMotor(sc, pc, distribuir(pc, 60));
    expect(fc).toMatch(/fn cuerpoCercano\(/);
    expect(fc).toMatch(/return cuerpoCercano\(p, RADIO_B\)/);
    expect(fc).not.toMatch(/Infinity|NaN/);
  });

  it('sin obstáculos, nadie queda en contacto', () => {
    const sin = wgslObstaculos([]);
    expect(sin).toMatch(/fn masCercano/);
    expect(sin).not.toMatch(/obstaculo0/);
  });

  it('la escena del tamaño de la camiseta cabe en los límites por defecto de WebGPU', () => {
    const g = escenaCusick(5, 480);
    const sg = new SistemaTela(g.malla, TELA_DE_LABORATORIO, { obstaculos: g.obstaculos });
    const pg = empaquetar(sg);
    const tam = tamanosDeBufer(distribuir(pg, 3600), pg);
    expect(sg.n).toBeGreaterThan(25_000);
    // con contacto propio (el búfer atómico incluido): 128 MiB por búfer (maxStorageBufferBindingSize) y 8 búferes por etapa
    // (maxStorageBuffersPerShaderStage)
    expect(sg.aj.contactoPropio).toBe(true);
    expect(Object.keys(tam)).toContain('at');
    for (const bytes of Object.values(tam)) expect(bytes).toBeLessThanOrEqual(128 * 1024 * 1024);
    expect(Object.keys(tam).length).toBeLessThanOrEqual(8);
  }, 180_000);
});
