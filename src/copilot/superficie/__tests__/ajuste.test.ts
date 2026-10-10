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
 * 0,1 m en reposo, estirada por su factor. El estiramiento por vértice es
 * ese factor (`computePerVertexStrain`).
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

  it('mide cada pieza por sus vértices, con la tela de la simulación', async () => {
    // Popelina: se rompe al 8 % (`maxStretchBeforeBreak: 8`). Al 20 % no se puede
    // poner (2,5 veces lo que aguanta); al 7 % está ajustada (0,875); sin estirar, bien.
    tela([{ pieceId: 'a', factor: 1.2 }, { pieceId: 'b', factor: 1.07 }, { pieceId: 'c', factor: 1 }]);
    setActiveSolverTier('webgpu');
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
