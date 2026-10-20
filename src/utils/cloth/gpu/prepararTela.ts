/**
 * La parte CPU del armado TSL: fusión de piezas, restricciones de
 * estiramiento y flexión, coloreado, empaquetado de costuras, banda F3,
 * quads entre piezas, CSR de self-collision, soldadura de normales y radios
 * del tirante. Es el código que antes corría dentro de
 * `GpuSolverClient.initMultiPieceTsl`, movido tal cual para que el preparador
 * lo pueda correr en un worker: con las mismas entradas da los mismos
 * arreglos al solver (`__tests__/prepararTela.test.ts` fija la huella).
 *
 * Pura: sin window, sin three, sin GPU. De `tslBuffers` y `gpuSolverClient`
 * (los dos cargan three) solo importa tipos. Los interruptores de desarrollo
 * llegan como argumento, leídos en el hilo principal por
 * `interruptoresDeTela()`, y los avisos vuelven en `avisos` para escribirlos
 * allí.
 *
 * @module prepararTela
 */

import type { PieceMeshData } from './gpuSolverClient';
import type { SeamPair } from '../seamPairs';
import type { FabricComplianceConfig, TslSeamConstraintData } from './tslBuffers';
import {
  extractStretchConstraints,
  extractBendConstraints,
  buildCrossSeamBendQuads,
  colorConstraints,
  EdgeType,
  type BendConstraints,
  type ColoredConstraints,
} from './gpuBuffers';
import { buildAdjacency } from '../selfCollision';
import { buildAdjacencyCSR } from '../wasm/adjacencyCSR';
import { fabricInvMassScale } from '../physicalFabric';
import { buildTetherRadii } from './tetherRadii';

/** Interruptores de desarrollo del armado (kill-switches en localStorage). */
export interface Interruptores {
  /** 'vina-crossbend' distinto de 'off': quads de flexión entre piezas. */
  crossBend: boolean;
  /** 'vina-seamscx' distinto de 'off': las parejas cosidas entran a la adyacencia de self-collision. */
  seamScExcl: boolean;
}

/**
 * Lo que la parte CPU del armado le deja a `initMultiPieceTsl`. Solo datos
 * clonables (structuredClone, postMessage): los Map viajan como entradas.
 */
export interface TelaPreparada {
  totalVerts: number;
  pieceVertexRanges: Array<[string, { start: number; count: number }]>;
  positions: Float32Array;
  /** Con la masa de la banda F3 aplicada. */
  invMass: Float32Array;
  /** Snapshot tras la banda F3: freeze/unfreeze restaura la nervadura. */
  originalInvMass: Float32Array;
  triangles: Uint32Array;
  hasUvs: boolean;
  edgeData: { ids: Int32Array; lengths: Float32Array };
  /** La resuelta: la del llamador o el default del armado. */
  fabric: FabricComplianceConfig;
  colored: ColoredConstraints;
  seam: TslSeamConstraintData | null;
  /** Flexión intra-pieza más los quads entre piezas que pasaron la barrera Halberg. */
  bendAll: BendConstraints;
  crossQuadCount: number;
  bendColorDelta: number;
  /** Llave del quad entre piezas → partners [b0,b1] del hinge; null sin quads. */
  crossQuadPartners: Array<[string, [number, number]]> | null;
  /** Compliance destino del planchado; null cuando no entraron quads (el cliente conserva la suya). */
  pressedBendCompliance: number | null;
  tetherRadii: Float64Array;
  csr: { offsets: Uint32Array; neighbors: Uint32Array };
  weld: { verts: Uint32Array; offsets: Uint32Array; partners: Uint32Array } | null;
  /** Los console.warn del armado, para escribirlos en el hilo principal. */
  avisos: string[];
}

/**
 * Lo barato de la spec § 4.4: una tela es de estas piezas si trae las mismas,
 * en el mismo orden y con los mismos vértices. Devuelve la primera diferencia,
 * dicha, o null si coinciden. O(piezas).
 */
export function diferenciaConLasPiezas(t: TelaPreparada, pieces: PieceMeshData[]): string | null {
  if (t.pieceVertexRanges.length !== pieces.length) {
    return `piezas: ${t.pieceVertexRanges.length} en la tela, ${pieces.length} para simular`;
  }
  for (let i = 0; i < pieces.length; i++) {
    const [id, { count }] = t.pieceVertexRanges[i];
    const { pieceId, vertices } = pieces[i];
    if (id !== pieceId) return `pieza ${i + 1}: '${id}' en la tela, '${pieceId}' para simular`;
    if (count !== vertices.length / 3) return `vértices de '${id}': ${count} en la tela, ${vertices.length / 3} para simular`;
  }
  return null;
}

/** Lee los interruptores de desarrollo en el hilo principal (localStorage). */
export function interruptoresDeTela(): Interruptores {
  return {
    // Kill-switch dev: localStorage 'vina-crossbend' = 'off'.
    crossBend: typeof window === 'undefined'
      || window.localStorage?.getItem('vina-crossbend') !== 'off',
    // Kill-switch dev: localStorage 'vina-seamscx' = 'off'.
    seamScExcl: typeof window === 'undefined'
      || window.localStorage?.getItem('vina-seamscx') !== 'off',
  };
}

/**
 * Prepara la tela para el solver TSL.
 *
 * @param fabricCompliance — compliance por tipo de arista, de toXPBDParams().
 *   Con ella, cada restricción de estiramiento y de flexión lleva la suya
 *   según la dirección de su arista en UV (urdimbre, trama o sesgo).
 */
export function prepararTela(
  pieces: PieceMeshData[],
  seamPairs: SeamPair[] | undefined,
  fabricCompliance: FabricComplianceConfig | undefined,
  interruptores: Interruptores,
): TelaPreparada {
  const avisos: string[] = [];

  // Merge pieces (same logic as initMultiPiece)
  let totalVerts = 0;
  let totalTris = 0;
  const vertexOffsets = new Map<string, number>();

  for (const p of pieces) {
    vertexOffsets.set(p.pieceId, totalVerts);
    totalVerts += p.vertices.length / 3;
    totalTris += p.triIds.length;
  }

  // Store piece vertex ranges for freeze/unfreeze support
  const pieceVertexRanges = new Map<string, { start: number; count: number }>();
  for (const p of pieces) {
    const start = vertexOffsets.get(p.pieceId);
    if (start === undefined) {
      // Unreachable by construction (the offsets map is built from this
      // same `pieces` array above) — fail loudly instead of silently
      // mapping the piece onto offset 0, which would corrupt
      // freeze/unfreeze ranges and any seam packing keyed off them
      // (parity plan Fase 4: no silent vertex-offset defaults). The init
      // throw is caught by the tier cascade, which falls through to WASM.
      throw new Error(`[GpuSolverClient] missing vertex offset for piece ${p.pieceId}`);
    }
    const count = p.vertices.length / 3;
    pieceVertexRanges.set(p.pieceId, { start, count });
  }

  const positions = new Float32Array(totalVerts * 3);
  const invMass = new Float32Array(totalVerts);
  const triangles = new Uint32Array(totalTris);
  // P7-density: masa relativa a la referencia (150 GSM) — a la densidad de
  // referencia esto es 1.0 exacto (comportamiento pre-P7). Espejo del
  // worker WASM y del scale del CPU initPhysics.
  const invMassFill = fabricInvMassScale(fabricCompliance?.density);
  // Merge UVs for anisotropic edge classification
  let mergedUvs: Float32Array | undefined;
  let hasUvs = false;

  let vOff = 0;
  let tOff = 0;

  for (const p of pieces) {
    const numV = p.vertices.length / 3;
    positions.set(p.vertices, vOff * 3);
    for (let i = 0; i < numV; i++) invMass[vOff + i] = invMassFill;
    for (let i = 0; i < p.triIds.length; i++) triangles[tOff + i] = p.triIds[i] + vOff;

    // Merge UVs
    if (p.uvs && p.uvs.length >= numV * 2) {
      if (!mergedUvs) {
        mergedUvs = new Float32Array(totalVerts * 2);
      }
      mergedUvs.set(p.uvs.subarray(0, numV * 2), vOff * 2);
      hasUvs = true;
    }

    vOff += numV;
    tOff += p.triIds.length;
  }

  // NOTA: el snapshot originalInvMass se toma DESPUÉS de aplicar la masa
  // de banda F3 (más abajo) — freeze/unfreeze debe restaurar la nervadura,
  // no la masa uniforme (corrección mnCheck; el comentario viejo de "after
  // pins" pedía exactamente esto).

  // F3 nervadura: adyacencia de malla hoisted — la consumen la banda de
  // margen (BFS) y el CSR de self-collision (antes se construía allá abajo;
  // una sola construcción, corrección mnCheck).
  const adjSets = buildAdjacency(new Int32Array(triangles), totalVerts); // firma pide Int32Array (S8)

  // Extract constraints with UV-based edge classification
  const uvArg = hasUvs ? mergedUvs : undefined;
  const stretch = extractStretchConstraints(positions, triangles, uvArg);
  // Bridge edge data (#1010): retener copia (ids Uint32→Int32, contrato
  // SolverEdgeData/fitMaps.ts) para requestEdgeData() — el tier GPU publica
  // el MISMO contrato que WasmSolverClient/ClothWorkerClient.
  const edgeData = { ids: new Int32Array(stretch.ids), lengths: stretch.restLengths };
  const bend = extractBendConstraints(positions, triangles, uvArg);

  // Compute per-constraint compliance from edge types + fabric config
  const fabric: FabricComplianceConfig = fabricCompliance ?? {
    stretchComplianceWarp: 0.0,
    stretchComplianceWeft: 0.0,
    shearCompliance: 0.001,
    // P1 dihedral: default ANGULAR 1e4 — banda [6e2,1e5] calibrada contra
    // el gate Cusick 2026-07-02 (la teórica [6e-2,10] era bend rígido).
    // PARITY: WASM (lib.rs) + CPU (xpbdSolver) llevan el MISMO default.
    bendComplianceWarp: 1e4,
    bendComplianceWeft: 1e4,
  };

  const numStretch = stretch.ids.length / 2;
  const stretchCompliance = new Float32Array(numStretch);
  for (let i = 0; i < numStretch; i++) {
    const et = stretch.edgeTypes[i];
    if (et === EdgeType.WARP) stretchCompliance[i] = fabric.stretchComplianceWarp;
    else if (et === EdgeType.WEFT) stretchCompliance[i] = fabric.stretchComplianceWeft;
    else stretchCompliance[i] = fabric.shearCompliance;
  }

  const colored = colorConstraints(stretch.ids, stretch.restLengths, numStretch, stretchCompliance);

  // Seam packing (#897 F1) — espejo del seeding CPU/WASM: target inicial =
  // distancia mundial actual × tension/100 (decae en GPU), compliance
  // per-constraint, coloreado para dispatch paralelo race-free.
  let seam: TslSeamConstraintData | null = null;
  // Pares globales POR COSTURA en orden t — alimentan los quads dihedral
  // cross-seam (acta consejo costura-real 2026-07-05).
  const seamGlobalPairs: number[][] = [];
  if (seamPairs && seamPairs.length > 0) {
    const seamIds: number[] = [];
    const seamDist: number[] = [];
    const seamCompliance: number[] = [];
    for (const sp of seamPairs) {
      const offA = vertexOffsets.get(sp.pieceAId);
      const offB = vertexOffsets.get(sp.pieceBId);
      if (offA === undefined || offB === undefined) {
        avisos.push(
          `[GpuSolverClient.initMultiPieceTsl] seam pair refs unknown piece ` +
          `(A=${sp.pieceAId}${offA === undefined ? ' [missing]' : ''}, ` +
          `B=${sp.pieceBId}${offB === undefined ? ' [missing]' : ''}); skipping`
        );
        continue;
      }
      const globals: number[] = [];
      for (const [a, b] of sp.vertexPairs) {
        const ga = a + offA;
        const gb = b + offB;
        const dx = positions[ga * 3] - positions[gb * 3];
        const dy = positions[ga * 3 + 1] - positions[gb * 3 + 1];
        const dz = positions[ga * 3 + 2] - positions[gb * 3 + 2];
        seamIds.push(ga, gb);
        seamDist.push(Math.sqrt(dx * dx + dy * dy + dz * dz) * sp.tensionFactor);
        seamCompliance.push(sp.compliance);
        globals.push(ga, gb);
      }
      if (globals.length > 0) seamGlobalPairs.push(globals);
    }
    if (seamIds.length > 0) {
      const seamColored = colorConstraints(
        new Uint32Array(seamIds),
        new Float32Array(seamDist),
        seamIds.length / 2,
        new Float32Array(seamCompliance),
      );
      seam = {
        ids: seamColored.ids,
        targetDist: seamColored.restLengths,
        // compliance! safe: always passed above, and the length>0 guard
        // skips colorConstraints' compliance-less zero-constraint early return.
        compliance: seamColored.compliance!,
        colorRanges: seamColored.colorRanges,
      };
    }
  }

  // ── F3 NERVADURA (acta consejo costura-proceso-real 2026-07-05) ─────────
  //
  // La banda de margen real tiene 2-4 capas de tela: flexión ~8-27× (cúbica
  // con el grosor) y 2-3× la masa — es la nervadura que desvía los pliegues
  // del drapeado y hace que la costura cuelgue estable en vez de flotar.
  // Banda = BFS 2 anillos (~1cm a malla de 5mm) desde los vértices de
  // costura, sobre la adyacencia de malla PURA (sin partners cross-seam —
  // la banda ya cubre ambos lados porque los pares aportan a y b).
  // Masa ×2 (invMass ×0.5) + flexión ×3 (÷3 compliance) — empezamos ×3 y
  // no el 8-27× idealizado porque la escala cúbica sobre malla gruesa
  // sobre-rigidiza (calibrar en A/B visual).
  const bandVerts = new Set<number>();
  if (seamGlobalPairs.length > 0) {
    const SEAM_BAND_RINGS = 2;
    for (const pairs of seamGlobalPairs) for (const v of pairs) bandVerts.add(v);
    let frontier = [...bandVerts];
    for (let ring = 0; ring < SEAM_BAND_RINGS; ring++) {
      const next: number[] = [];
      for (const v of frontier) {
        for (const nb of adjSets[v]) {
          if (!bandVerts.has(nb)) {
            bandVerts.add(nb);
            next.push(nb);
          }
        }
      }
      frontier = next;
    }
    for (const v of bandVerts) invMass[v] *= 0.5;

    // Flexión de banda: quads intra-pieza con los 4 vértices en banda →
    // fabric/3 vía el override per-quad (NaN = mapping normal). El branch
    // cross-seam de abajo PRESERVA este array al construir el conjunto.
    const numBendQuads = bend.ids.length / 4;
    if (numBendQuads > 0) {
      const bandCompliance = new Float32Array(numBendQuads).fill(Number.NaN);
      let bandQuads = 0;
      for (let i = 0; i < numBendQuads; i++) {
        const o = i * 4;
        if (
          bandVerts.has(bend.ids[o]) && bandVerts.has(bend.ids[o + 1]) &&
          bandVerts.has(bend.ids[o + 2]) && bandVerts.has(bend.ids[o + 3])
        ) {
          const et = bend.edgeTypes[i];
          const base = et === EdgeType.WARP
            ? fabric.bendComplianceWarp
            : fabric.bendComplianceWeft;
          bandCompliance[i] = base / 3;
          bandQuads++;
        }
      }
      if (bandQuads > 0) bend.compliance = bandCompliance;
    }
  }

  // Snapshot invMass para freeze/unfreeze — DESPUÉS de la masa de banda F3
  // (restore preserva la nervadura) y antes de que createTslBuffers copie.
  const originalInvMass = new Float32Array(invMass);

  // ── Bend cross-seam (acta consejo costura-real 2026-07-05) ──────────────
  //
  // El término que convierte la unión de BISAGRA en costura de fábrica: la
  // curvatura fluye a través de la costura. Quads dihedral cross-pieza
  // concatenados al set de bend ANTES del coloring (mismo kernel P1, cero
  // dispatch nuevo — viajan dentro de bendColors). Rest 0, compliance =
  // bendComplianceWeft del fabric (EdgeType.WEFT en el builder). GPU-only:
  // divergencia A7 deliberada (precedente self-seams, Epic-746) — el
  // fallback WASM/CPU drapea con bisagras, documentado.
  //
  // BARRERA HALBERG (automática, ratificada): los quads cross-seam tocan
  // vértices de alta valencia; si el coloring conjunto infla los grupos de
  // bend en más de 4 colores vs el baseline intra-pieza, el costo son
  // cientos de encodes extra por frame → los quads se EXCLUYEN con warn
  // (la feature no se shipea rota, degrada a bisagra).
  //
  // Kill-switch dev: localStorage 'vina-crossbend' = 'off' (interruptores.crossBend).
  let bendAll = bend;
  let crossQuadCount = 0;
  let bendColorDelta = 0;
  let crossQuadPartners: Map<string, [number, number]> | null = null;
  let pressedBendCompliance: number | null = null;
  if (interruptores.crossBend && seamGlobalPairs.length > 0) {
    const cross = buildCrossSeamBendQuads(triangles, seamGlobalPairs);
    if (cross.ids.length > 0) {
      const numBase = bend.ids.length / 4;
      const baseColors = numBase > 0
        ? colorConstraints(bend.ids, bend.restAngles, numBase, undefined, 4).colorRanges.length
        : 0;
      const jointIds = new Uint32Array(bend.ids.length + cross.ids.length);
      jointIds.set(bend.ids, 0);
      jointIds.set(cross.ids, bend.ids.length);
      const jointAngles = new Float32Array(bend.restAngles.length + cross.restAngles.length);
      jointAngles.set(bend.restAngles, 0);
      jointAngles.set(cross.restAngles, bend.restAngles.length);
      const jointTypes = new Uint8Array(bend.edgeTypes.length + cross.edgeTypes.length);
      jointTypes.set(bend.edgeTypes, 0);
      jointTypes.set(cross.edgeTypes, bend.edgeTypes.length);
      const jointColors = colorConstraints(
        jointIds, jointAngles, jointIds.length / 4, undefined, 4,
      ).colorRanges.length;
      bendColorDelta = jointColors - baseColors;
      if (bendColorDelta <= 4) {
        // Compliance per-quad: intra = NaN (createTslBuffers mapea
        // edgeType→fabric como siempre); cross = TOPE BLANDO de la banda
        // angular calibrada [6e2, 1e5] MIENTRAS la costura se cierra.
        // MEDIDO 2026-07-05 (A/B con el kill-switch): a rigidez del
        // fabric + rest 0, los quads planchaban costuras con ángulo real
        // (la sisa envuelve por diseño) → grieta con piel + tela
        // explotada. El bug era el REST (0 = "prefiere plano"), no la
        // rigidez: en settle el press F1 captura el ángulo ensamblado
        // real y ENTONCES endurece a fabric (pressCrossSeamAngles) — el
        // planchado del proceso real, por fases como en fábrica.
        const CROSS_SEAM_BEND_COMPLIANCE = 1e5;
        const numCross = cross.ids.length / 4;
        const jointCompliance = new Float32Array(jointIds.length / 4).fill(Number.NaN);
        // Preserva los overrides de banda F3 en la región intra.
        if (bend.compliance) jointCompliance.set(bend.compliance, 0);
        jointCompliance.fill(CROSS_SEAM_BEND_COMPLIANCE, numBase, numBase + numCross);
        bendAll = {
          ids: jointIds,
          restAngles: jointAngles,
          edgeTypes: jointTypes,
          compliance: jointCompliance,
        };
        crossQuadCount = numCross;
        // F1: stash para el press en settle (llave del quad → partners B
        // del hinge). El fabric weft es la rigidez destino del planchado.
        crossQuadPartners = new Map();
        for (let q = 0; q < numCross; q++) {
          const o = q * 4;
          const key = `${cross.ids[o]},${cross.ids[o + 1]},${cross.ids[o + 2]},${cross.ids[o + 3]}`;
          crossQuadPartners.set(key, [
            cross.seamPartners![q * 2],
            cross.seamPartners![q * 2 + 1],
          ]);
        }
        pressedBendCompliance = fabric.bendComplianceWeft;
      } else {
        avisos.push(
          `[GpuSolverClient] cross-seam bend EXCLUIDO: coloring conjunto ` +
          `infla bendColors en ${bendColorDelta} (>4) — barrera Halberg`,
        );
      }
    }
  }

  // Self-collision (#897 F3): SIEMPRE activo en el tier GPU. RATIFICADO:
  // diverge del preset 'normal' (selfCollision false) — esa es una
  // decisión de perf MEDIDA EN WASM (#608/#892, kernel a 1FPS) que no
  // aplica a compute GPU (buckets K=8, 4 pases). El kill-switch es el
  // gate de dispatch en GarmentSimulation. La adyacencia se construye
  // sobre los triángulos MERGED (offsets de pieza ya horneados); el tamaño
  // de tabla, nextPrime(2N), lo pone initMultiPieceTsl.
  //
  // F4a (acta costura-proceso-real): las parejas COSIDAS entran a la
  // adyacencia (hoisted arriba) antes del CSR — dos plies cosidos están
  // en contacto POR DISEÑO, no en colisión. floor==thickness==2mm es
  // equilibrio exacto y F2 densifica pares justo en ese umbral (el
  // escéptico runtime lo subió de condicional a listo-en-el-PR).
  // Kill-switch dev: localStorage 'vina-seamscx' = 'off' (interruptores.seamScExcl).
  if (interruptores.seamScExcl) {
    for (const pairs of seamGlobalPairs) {
      for (let k = 0; k + 1 < pairs.length; k += 2) {
        const a = pairs[k], b = pairs[k + 1];
        if (a === b) continue;
        adjSets[a].add(b);
        adjSets[b].add(a);
      }
    }
  }
  const csr = buildAdjacencyCSR(adjSets, totalVerts);

  // Normal-weld cross-seam (acta consejo costura-real 2026-07-05): CSR
  // vértice→parejas construido de los MISMOS pares globales del seam
  // packing — las normales se sueldan a través de la unión en el kernel
  // normalWeld (post-normalNormalize) y la superficie se lee continua.
  // Orden determinista (verts y parejas sorted) — P4.
  let weld: TelaPreparada['weld'] = null;
  if (seamGlobalPairs.length > 0) {
    const partnersByVert = new Map<number, Set<number>>();
    for (const pairs of seamGlobalPairs) {
      for (let k = 0; k + 1 < pairs.length; k += 2) {
        const a = pairs[k], b = pairs[k + 1];
        if (a === b) continue;
        let sa = partnersByVert.get(a);
        if (!sa) { sa = new Set(); partnersByVert.set(a, sa); }
        sa.add(b);
        let sb = partnersByVert.get(b);
        if (!sb) { sb = new Set(); partnersByVert.set(b, sb); }
        sb.add(a);
      }
    }
    const weldVerts = [...partnersByVert.keys()].sort((x, y) => x - y);
    if (weldVerts.length > 0) {
      const weldOffsets = new Uint32Array(weldVerts.length + 1);
      const weldPartners: number[] = [];
      weldVerts.forEach((v, i) => {
        const ps = [...partnersByVert.get(v)!].sort((x, y) => x - y);
        weldPartners.push(...ps);
        weldOffsets[i + 1] = weldPartners.length;
      });
      weld = {
        verts: new Uint32Array(weldVerts),
        offsets: weldOffsets,
        partners: new Uint32Array(weldPartners),
      };
    }
  }

  // Per-region tether radii (frente#2). Each piece contributes its region
  // string (threaded via PieceMeshData.region); missing region → default 0.06 m.
  const tetherRadii = buildTetherRadii(
    pieces.map((p) => ({ region: p.region ?? 'unknown', vertexCount: p.vertices.length / 3 })),
  );

  return {
    totalVerts,
    pieceVertexRanges: [...pieceVertexRanges],
    positions,
    invMass,
    originalInvMass,
    triangles,
    hasUvs,
    edgeData,
    fabric,
    colored,
    seam,
    bendAll,
    crossQuadCount,
    bendColorDelta,
    crossQuadPartners: crossQuadPartners && [...crossQuadPartners],
    pressedBendCompliance,
    tetherRadii,
    csr,
    weld,
    avisos,
  };
}
