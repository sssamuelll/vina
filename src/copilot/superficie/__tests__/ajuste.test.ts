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
      { piece_id: 'a', name: 'Delantero', strain_max_pct: 20, strain_mean_pct: 20, tight_pct: 0, cant_wear_pct: 100 },
      { piece_id: 'b', name: 'Espalda', strain_max_pct: 7, strain_mean_pct: 7, tight_pct: 100, cant_wear_pct: 0 },
      { piece_id: 'c', name: 'Cuello', strain_max_pct: 0, strain_mean_pct: 0, tight_pct: 0, cant_wear_pct: 0 },
    ]);
    expect(r.garment).toMatchObject({ strain_max_pct: 20, tight_pct: 33.3, cant_wear_pct: 33.3 });
  });

  it('sin las aristas del solver, lo dice', async () => {
    tela([{ pieceId: 'a', factor: 1 }]);
    latirLaSimulacion(null);
    const { ctx } = tienda([suelta('a')], [], {}, {}, { simulationState: 'paused' });
    expect(await leer(ctx)).toMatchObject({ available: false, reason: expect.stringMatching(/edge data/) });
  });
});
