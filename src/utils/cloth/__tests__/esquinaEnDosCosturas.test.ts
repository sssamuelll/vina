/**
 * La esquina, en sus dos costuras (#1250 C1): en el DXF cada borde termina en un punto y el siguiente empieza
 * en una copia exacta; el mallador deja una sola copia con el origen de la primera, y la esquina entraba solo
 * en la costura del borde que termina en ella.
 */
import { describe, expect, it } from 'vitest';
import {
  buildSeamConstraints, extenderSobreCopias, mergeMeshes, parameterizeEdgeFromBoundary, seamInitDataToSeams,
} from '../seamAssembly';
import { buildElasticConstraints } from '../elasticAssembly';
import { seamInitDataToPairs } from '../seamPairs';
import type { Elastic, PathCommand } from '../../../types/types';
import { commandRangeToFlattened, flattenPath } from '../../seam/index';
import { aInitData, costurasDeMaria, importarMariaClasificada, mallarParaCoser } from './camisaDeMaria';

// Un cuadrado de 100 mm cuyo borde derecho empieza en una copia exacta del punto donde termina el de abajo:
// aplanado [(0, 0), (100, 0), (100, 0)*, (100, 100), (0, 100)].
const PLANO = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
// el mallador deja la esquina con el origen de la primera copia (1); 2,5 es un punto subdividido del borde
const ORIGEN = Float64Array.from([0, 1, 2.5, 3, 4]);
const POS = Float32Array.from([0, 0, 0, 0.1, 0, 0, 0.1, 0, 0.05, 0.1, 0, 0.1, 0, 0, 0.1]);

describe('la esquina, en sus dos costuras (#1250 C1)', () => {
  it('el rango se extiende sobre las copias exactas de sus puntas, y solo sobre ellas', () => {
    expect(extenderSobreCopias(PLANO, [2, 3])).toEqual([1, 3]);
    expect(extenderSobreCopias(PLANO, [0, 1])).toEqual([0, 2]);
    expect(extenderSobreCopias(PLANO, [3, 4])).toEqual([3, 4]);
    // un rango que ya da toda la vuelta no crece
    expect(extenderSobreCopias(PLANO, [0, 4])).toEqual([0, 4]);
  });

  it('el borde que empieza en la copia recibe el vértice de la esquina, con t = 0', () => {
    const borde = parameterizeEdgeFromBoundary(ORIGEN, POS, 0, PLANO, [2, 3]);
    expect(borde.map((v) => v.index)).toEqual([1, 2, 3]);
    expect(borde[0].t).toBe(0);
  });

  it('el borde que termina en la esquina la conserva', () => {
    const borde = parameterizeEdgeFromBoundary(ORIGEN, POS, 0, PLANO, [0, 1]);
    expect(borde.map((v) => v.index)).toEqual([0, 1]);
  });

  it('el elástico del borde que empieza en la copia incluye el vértice de la esquina', () => {
    // PLANO como contorno de comandos (sin Z: el aplanado es exactamente PLANO); el borde derecho es el comando 3
    const contorno: PathCommand[] = [
      { type: 'M', values: [0, 0] }, { type: 'L', values: [100, 0] }, { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 100] }, { type: 'L', values: [0, 100] },
    ];
    const elastico: Elastic = { id: 'e1', pieceId: 'p', edgeName: 'derecho', stretchRatio: 0.5, width: 12, type: 'band', tStart: 0, tEnd: 1, active: true };
    // posiciones (x, y, 0) de los vértices de ORIGEN: 0, la esquina (1), el punto medio (2,5), 3 y 4
    const vertices = Float32Array.from([0, 0, 0, 100, 0, 0, 100, 50, 0, 100, 100, 0, 0, 100, 0]);
    const { constraints } = buildElasticConstraints(
      [elastico],
      new Map([['p', contorno]]),
      { vertices, indices: new Uint32Array(0), pieceOffsets: new Map([['p', { vertexOffset: 0, indexOffset: 0 }]]) },
      new Map([['p', { edges: [{ name: 'derecho', segmentRange: [3, 4] as [number, number] }], boundaryOrig: ORIGEN }]]),
    );
    // sin la esquina (vértice 1) solo habría [2, 3]
    expect(constraints.map((c) => [c.vertexA, c.vertexB])).toEqual([[1, 2], [2, 3]]);
  });

  it('un duplicado de la esquina con el origen justo bajo el entero queda al principio, no al final', () => {
    // la línea central de la tira de María deja un vértice sobre la esquina con origen 14,9999995 (no 15): entra por
    // la holgura de inRange, y medido módulo N contra el inicio del rango caía al final del borde (t ≈ 1, la tira
    // "volvía" 228 mm). Aquí: un sexto vértice en el mismo punto que la esquina (1), con origen 1 - 5e-7.
    const origen = Float64Array.from([0, 1, 2.5, 3, 4, 1 - 5e-7]);
    const pos = Float32Array.from([...POS, 0.1, 0, 0]);
    const borde = parameterizeEdgeFromBoundary(origen, pos, 0, PLANO, [2, 3]);
    expect(borde.map((v) => v.index)).toEqual([5, 1, 2, 3]);
    expect(borde.slice(0, 2).map((v) => v.t)).toEqual([0, 0]);
  });

  it('María: toda esquina entre dos bordes cosidos está en las dos costuras', { timeout: 120_000 }, () => {
    const piezas = importarMariaClasificada();
    const costuras = costurasDeMaria(piezas);
    const malladas = mallarParaCoser(piezas, 10);
    // los vértices cosidos de cada borde (pieza|borde), juntando las medias costuras del mismo borde
    const cosidos = new Map<string, Set<number>>();
    for (const c of costuras) {
      const [par] = seamInitDataToPairs(aInitData([c]), malladas);
      if (!par) continue;
      for (const [lado, k] of [['pieceA', 0], ['pieceB', 1]] as const) {
        const clave = `${c[lado].pieceId}|${c[lado].edgeName}`;
        const set = cosidos.get(clave) ?? new Set<number>();
        for (const v of par.vertexPairs) set.add(v[k]);
        cosidos.set(clave, set);
      }
    }
    let esquinas = 0;
    for (const p of piezas) {
      const m = malladas.find((x) => x.pieceId === p.id)!;
      const plano = flattenPath(p.outline, 12);
      const N = plano.length;
      const bordes = (p.edges ?? []).map((e) => ({ nombre: e.name, rango: commandRangeToFlattened(p.outline, e.segmentRange, 12) }));
      for (const a of bordes) {
        for (const b of bordes) {
          if (a === b || (a.rango[1] + 1) % N !== b.rango[0] % N) continue;
          const pa = plano[a.rango[1] % N], pb = plano[b.rango[0] % N];
          if (Math.hypot(pa.x - pb.x, pa.y - pb.y) > 0.1) continue;
          const sa = cosidos.get(`${p.id}|${a.nombre}`), sb = cosidos.get(`${p.id}|${b.nombre}`);
          if (!sa || !sb) continue;
          const orig = m.boundaryOrig!;
          let v = -1;
          for (let k = 0; k < orig.length; k++) if (orig[k] === a.rango[1] % N) v = k;
          expect(v, `${p.name}: la esquina ${a.nombre}→${b.nombre} tiene vértice`).toBeGreaterThanOrEqual(0);
          expect(sa.has(v), `${p.name}: ${a.nombre} cose su esquina final`).toBe(true);
          expect(sb.has(v), `${p.name}: ${b.nombre} cose la esquina donde empieza`).toBe(true);
          esquinas++;
        }
      }
    }
    expect(esquinas).toBeGreaterThan(10);
  });

  it('María: la CPU y la GPU dan los mismos pares, costura por costura', { timeout: 120_000 }, () => {
    // buildSeamConstraints (CPU y WASM) y seamInitDataToPairs (GPU) llaman a la misma parameterizeEdgeFromBoundary
    const piezas = importarMariaClasificada();
    const costuras = costurasDeMaria(piezas);
    const malladas = mallarParaCoser(piezas, 10);
    const mezcla = mergeMeshes(malladas.map((m) => ({ pieceId: m.pieceId, vertices: m.vertices!, triIds: m.triIds, uvs: m.uvs })));
    const contornos = new Map(piezas.map((p) => [p.id, p.outline]));
    const datos = new Map(malladas.map((m) => [m.pieceId, { edges: m.edges, meshMaxEdgeLength: m.meshMaxEdgeLength, boundaryOrig: m.boundaryOrig }]));
    let total = 0;
    for (const c of costuras) {
      const init = aInitData([c]);
      const gpu = seamInitDataToPairs(init, malladas)[0]?.vertexPairs.length ?? 0;
      const cpu = buildSeamConstraints(seamInitDataToSeams(init), contornos, mezcla, datos).count;
      expect(cpu, `${c.pieceA.edgeName}↔${c.pieceB.edgeName}`).toBe(gpu);
      total += cpu;
    }
    expect(total).toBeGreaterThan(0);
  });
});
