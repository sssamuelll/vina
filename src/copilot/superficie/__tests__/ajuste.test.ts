import { afterEach, describe, it, expect } from 'vitest';
import { BufferGeometry, Float32BufferAttribute } from 'three';
import {
  clearActiveSolverTier, latirLaSimulacion, registerClothGeometry, setActiveSolverTier,
} from '../../../utils/cloth/solverRuntimeTracker';
import { ejecutarVerbo } from '../ejecutar';
import { VERBOS_DE_AJUSTE } from '../verbos/ajuste';
import type { ContextoDeVerbo } from '../tipos';
import { suelta, tienda } from './fixtures';

/**
 * Una tela de mentira: cada pieza son dos vértices unidos por una arista de
 * 0,1 m en reposo, estirada por su factor. El estiramiento de la pieza es ese
 * factor.
 */
function tela(trozos: { pieceId: string; factor: number }[]) {
  const pos: number[] = [];
  const ids: number[] = [];
  trozos.forEach((t, i) => {
    pos.push(0, 0, 0, 0.1 * t.factor, 0, 0);
    ids.push(2 * i, 2 * i + 1);
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(pos, 3));
  registerClothGeometry(geometry, trozos.map((t, i) => ({ pieceId: t.pieceId, vertexOffset: 2 * i, vertexCount: 2, triCount: 0 })));
  latirLaSimulacion({ stretchingIds: new Int32Array(ids), stretchingLengths: new Float32Array(trozos.map(() => 0.1)) });
}

/** Una tela a mano: por pieza, sus vértices (m) y sus aristas `[i, j, reposo en m]` en índices de la pieza. */
function telaConAristas(piezas: { pieceId: string; vertices: number[][]; aristas: [number, number, number][] }[]) {
  const pos: number[] = [];
  const ids: number[] = [];
  const reposo: number[] = [];
  const manifest: { pieceId: string; vertexOffset: number; vertexCount: number; triCount: number }[] = [];
  for (const p of piezas) {
    const base = pos.length / 3;
    p.vertices.forEach(v => pos.push(v[0], v[1], v[2]));
    p.aristas.forEach(([i, j, r]) => { ids.push(base + i, base + j); reposo.push(r); });
    manifest.push({ pieceId: p.pieceId, vertexOffset: base, vertexCount: p.vertices.length, triCount: 0 });
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(pos, 3));
  registerClothGeometry(geometry, manifest);
  latirLaSimulacion({ stretchingIds: new Int32Array(ids), stretchingLengths: new Float32Array(reposo) });
}

const leer = async (ctx: ContextoDeVerbo) => {
  const r = await ejecutarVerbo(VERBOS_DE_AJUSTE, 'fit_map', {}, ctx);
  if (!r.ok) throw new Error(r.error);
  return r.result as Record<string, unknown>;
};

afterEach(() => {
  registerClothGeometry(null, []);
  latirLaSimulacion(null);
  clearActiveSolverTier();
});

describe('fit_map', () => {
  it('sin simulación no hay mapa, y dice qué hacer', async () => {
    const { ctx } = tienda([suelta('a')]);
    expect(await leer(ctx)).toMatchObject({ available: false, reason: expect.stringMatching(/simulate/) });
  });

  it('mide cada pieza con la tela de la simulación', async () => {
    // Popelina: se rompe al 8 % (`maxStretchBeforeBreak: 8`). Al 20 % no se puede
    // poner (2,5 veces lo que aguanta); al 7 % está ajustada (0,875); sin estirar, bien.
    setActiveSolverTier('webgpu');
    tela([{ pieceId: 'a', factor: 1.2 }, { pieceId: 'b', factor: 1.07 }, { pieceId: 'c', factor: 1 }]);
    const { ctx } = tienda([suelta('a', 'Delantero'), suelta('b', 'Espalda'), suelta('c', 'Cuello')], [], {}, {}, { simulationState: 'running' });
    const r = await leer(ctx);
    expect(r).toMatchObject({ available: true, tier: 'webgpu', fabric: { id: 'cotton-poplin', max_stretch_pct: 8 } });
    expect(r.pieces).toEqual([
      { piece_id: 'a', name: 'Delantero', strain_p50_pct: 20, strain_p95_pct: 20, tight_pct: 0, cant_wear_pct: 100 },
      { piece_id: 'b', name: 'Espalda', strain_p50_pct: 7, strain_p95_pct: 7, tight_pct: 100, cant_wear_pct: 0 },
      { piece_id: 'c', name: 'Cuello', strain_p50_pct: 0, strain_p95_pct: 0, tight_pct: 0, cant_wear_pct: 0 },
    ]);
    expect(r.garment).toMatchObject({ strain_p50_pct: 7, strain_p95_pct: 20, tight_pct: 33.3, cant_wear_pct: 33.3 });
  });

  it('el percentil 95 no es el máximo, y la tela encogida cuenta como 0 (revisión de los repasos)', async () => {
    // 19 aristas encogidas al 95 % de su largo, una al 2 % y una al 50 %, todas de 1 cm y sueltas.
    // Ordenadas: 19 ceros, 2, 50. Sin el recorte en 0 la mediana daría −5; con el máximo, el p95 daría 50.
    const vertices: number[][] = [];
    const aristas: [number, number, number][] = [];
    const arista = (f: number) => {
      const i = vertices.length;
      vertices.push([0, 0, i * 0.02], [0.01 * f, 0, i * 0.02]);
      aristas.push([i, i + 1, 0.01]);
    };
    for (let k = 0; k < 19; k++) arista(0.95);
    arista(1.02);
    arista(1.5);
    telaConAristas([{ pieceId: 'a', vertices, aristas }]);
    const { ctx } = tienda([suelta('a')], [], {}, {}, { simulationState: 'running' });
    const r = await leer(ctx);
    expect((r.pieces as object[])[0]).toMatchObject({ strain_p50_pct: 0, strain_p95_pct: 2 });
  });

  it('una pieza sin aristas que medir no dice que le queda perfecta: dice null', async () => {
    telaConAristas([
      { pieceId: 'a', vertices: [[0, 0, 0], [0.0005, 0, 0]], aristas: [[0, 1, 0.0005]] },
      { pieceId: 'b', vertices: [[0, 0, 0], [0.101, 0, 0]], aristas: [[0, 1, 0.1]] },
    ]);
    const { ctx } = tienda([suelta('a'), suelta('b')], [], {}, {}, { simulationState: 'running' });
    const r = await leer(ctx);
    expect((r.pieces as object[])[0]).toMatchObject({ strain_p50_pct: null, strain_p95_pct: null, tight_pct: null, cant_wear_pct: null });
    expect((r.pieces as object[])[1]).toMatchObject({ strain_p95_pct: 1, cant_wear_pct: 0 });
  });

  it('una tela con posiciones rotas no tiene mapa: no dice que le queda bien', async () => {
    telaConAristas([{ pieceId: 'a', vertices: [[0, 0, 0], [0.101, 0, 0], [NaN, 0, 0]], aristas: [[0, 1, 0.1], [0, 2, 0.1]] }]);
    const { ctx } = tienda([suelta('a')], [], {}, {}, { simulationState: 'running' });
    expect(await leer(ctx)).toMatchObject({ available: false, reason: expect.stringMatching(/invalid positions/) });
  });

  it('fuera de WebGPU avisa que las cifras salen altas: allí no hay repasos del estiramiento', async () => {
    setActiveSolverTier('wasm');
    tela([{ pieceId: 'a', factor: 1.05 }]);
    const { ctx } = tienda([suelta('a')], [], {}, {}, { simulationState: 'running' });
    const enWasm = await leer(ctx);
    expect(enWasm.note).toMatch(/wasm.*stretch passes.*read high/i);
    setActiveSolverTier('webgpu');
    tela([{ pieceId: 'a', factor: 1.05 }]);
    expect((await leer(ctx)).note).toBeUndefined();
  });

  it('con la simulación parada dice el tier que movió la tela, no «none», y no avisa de más', async () => {
    setActiveSolverTier('webgpu');
    tela([{ pieceId: 'a', factor: 1.05 }]);
    clearActiveSolverTier(); // parar libera el solver (useSimulationLifecycle)
    const { ctx } = tienda([suelta('a')], [], {}, {}, { simulationState: 'paused' });
    const r = await leer(ctx);
    expect(r).toMatchObject({ available: true, tier: 'webgpu' });
    expect(r.note).toBeUndefined();
  });

  it('cuenta la tela por largo, no por vértice: dos aristas cortas estiradas no vuelven roja la pieza entera', async () => {
    // Una arista larga floja y dos cortas al 20 %, todas con el vértice 0. Por vértice
    // (el máximo de sus aristas) saldrían 3 de 4 «no se puede poner»; por largo, 2 cm de 12.
    telaConAristas([{
      pieceId: 'a',
      vertices: [[0, 0, 0], [0.1, 0, 0], [0, 0.012, 0], [0, 0, 0.012]],
      aristas: [[0, 1, 0.1], [0, 2, 0.01], [0, 3, 0.01]],
    }]);
    const { ctx } = tienda([suelta('a')], [], {}, {}, { simulationState: 'running' });
    const r = await leer(ctx);
    expect((r.pieces as { cant_wear_pct: number }[])[0].cant_wear_pct).toBe(16.7);
  });

  it('las astillas de menos de 1 mm del mallado no cuentan', async () => {
    // Una arista de 10 cm al 1 % y una astilla de 0,5 mm estirada al 500 %.
    telaConAristas([{
      pieceId: 'a',
      vertices: [[0, 0, 0], [0.101, 0, 0], [0, 0.003, 0]],
      aristas: [[0, 1, 0.1], [0, 2, 0.0005]],
    }]);
    const { ctx } = tienda([suelta('a')], [], {}, {}, { simulationState: 'running' });
    const r = await leer(ctx);
    expect((r.pieces as object[])[0]).toMatchObject({ strain_p95_pct: 1, cant_wear_pct: 0 });
  });

  it('una tela recién puesta, que todavía no se movió, no tiene mapa (revisión final)', async () => {
    tela([{ pieceId: 'a', factor: 1.2 }]);
    // Otra simulación monta una tela nueva: las aristas y los cuadros de la vieja no valen.
    const nueva = new BufferGeometry();
    nueva.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 0.1, 0, 0], 3));
    registerClothGeometry(nueva, [{ pieceId: 'a', vertexOffset: 0, vertexCount: 2, triCount: 0 }]);
    const { ctx } = tienda([suelta('a')], [], {}, {}, { simulationState: 'running' });
    expect(await leer(ctx)).toMatchObject({ available: false, reason: expect.stringMatching(/has not moved yet/) });
  });

  it('sin las aristas del solver, lo dice', async () => {
    tela([{ pieceId: 'a', factor: 1 }]);
    latirLaSimulacion(null);
    const { ctx } = tienda([suelta('a')], [], {}, {}, { simulationState: 'paused' });
    expect(await leer(ctx)).toMatchObject({ available: false, reason: expect.stringMatching(/edge data/) });
  });
});
