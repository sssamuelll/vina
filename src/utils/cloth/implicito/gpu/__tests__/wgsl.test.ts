import { describe, expect, it } from 'vitest';
import { SistemaTela } from '../../sistema';
import { escenaCusick, TELA_DE_LABORATORIO } from '../../banco/escenas';
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

  it('la búsqueda en línea usa los planos fijos: posPrueba no consulta el obstáculo (E4)', () => {
    const cuerpo = fuente.slice(fuente.indexOf('fn posPrueba('), fuente.indexOf('fn anguloPrueba('));
    expect(cuerpo).not.toMatch(/masCercano/);
    expect(cuerpo).toMatch(/energiaPlano/);
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
    // 128 MiB por búfer (maxStorageBufferBindingSize) y 8 búferes por etapa (maxStorageBuffersPerShaderStage)
    for (const bytes of Object.values(tam)) expect(bytes).toBeLessThanOrEqual(128 * 1024 * 1024);
    expect(Object.keys(tam).length).toBeLessThanOrEqual(8);
  }, 180_000);
});
