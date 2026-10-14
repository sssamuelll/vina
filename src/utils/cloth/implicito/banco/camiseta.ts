/**
 * La camiseta de María para el banco (spec 2026-10-13 §4.4.2): el DXF importado y clasificado como al importarlo en la
 * app, cosido con autoSew más refineSeamsInWorld, mallado como lo malla el simulador y armado como prenda del motor
 * implícito, con sus puntos de costura (E1), sus bisagras de costura (E2) y la franja del margen. Cada pieza toma la
 * urdimbre de su línea de grano. La colocación la da quien llama: la de la referencia privada (colocacion.ts, E5 del
 * plan de la parte 2) o cualquier otra.
 */
import { importDXFContent } from '../../../dxf';
import { classifyPiecesGeometric } from '../../../geometricClassifier';
import { detectSemanticEdges } from '../../../semanticEdges';
import { autoSew } from '../../../autoSew';
import { refineSeamsInWorld } from '../../../autoSew/worldRefine';
import { grainlineEndpoints } from '../../../grainLine';
import { meshPiece } from '../../../mesh';
import { resolveArrangementWithFrames } from '../../arrangement/arrangementBinding';
import { seamInitDataToPairs, type PieceWithOutline } from '../../seamPairs';
import { seamsToInitData } from '../../../../components/Viewport3D/costurasDeLaSimulacion';
import type { BodyMeasurements, PatternPiece, Seam } from '../../../../types/types';
import type { BisagraDeCostura, PuntoDeCostura } from '../costuras';
import { armarPrenda, bisagrasDePrenda, costurasDePrenda, franjaDePrenda, type LadosDeCostura, type Prenda } from '../prenda';
import type { TelaFisica } from '../tela';

/** Las medidas con que la app refina las costuras de María en el mundo (las de seamCoverage.maria.test.ts). */
export const MEDIDAS_DE_MARIA = { height: 180, chest: 96, waist: 82, hips: 96, shoulder: 44, armLength: 64, inseam: 82 } as BodyMeasurements;

/** Las piezas del DXF, clasificadas y con sus bordes semánticos, como al importarlas en la app. */
export function piezasDeMaria(dxf: string): PatternPiece[] {
  const piezas = importDXFContent(dxf, { unit: 'auto', autoDetect: true }).pieces;
  const clases = classifyPiecesGeometric(piezas);
  for (const p of piezas) {
    const c = clases.get(p.id);
    if (c && c.category !== 'other') {
      p.category = c.category;
      if (c.side) p.side = c.side;
    }
    p.edges = detectSemanticEdges(p);
  }
  return piezas;
}

/** Las costuras de autoSew, refinadas en el mundo como en la app. */
export function costurasDeMaria(piezas: PatternPiece[]): Seam[] {
  return refineSeamsInWorld(
    autoSew(piezas, { minConfidence: 0.3 }).seams.map((s) => s.seam),
    piezas,
    resolveArrangementWithFrames(piezas, MEDIDAS_DE_MARIA, undefined),
  );
}

export type PiezaMallada = PieceWithOutline & { vertices: Float32Array; triIds: Int32Array; uvs?: Float32Array };

/** Las piezas malladas con las opciones de SimulationInitClient.meshPiece, listas para seamInitDataToPairs. */
export function mallarPiezas(piezas: PatternPiece[], aristaMm: number): PiezaMallada[] {
  return piezas.map((p) => {
    const m = meshPiece(p, { yHeight: 0, scale: 0.001, maxEdgeLength: aristaMm, minAngle: 25, maxRefinementPasses: 3, curveResolution: 12 });
    return {
      pieceId: p.id, vertices: m.vertices, triIds: m.triIds, uvs: m.uvs,
      outline: p.outline, edges: p.edges, boundaryOrig: m.boundaryOrig, meshMaxEdgeLength: aristaMm,
    };
  });
}

/** El dibujo de una pieza mallada (m): el mallador la acuesta en y = 0 con (x, z) = (x, y) del dibujo, centrada. */
export function patronDe(m: PiezaMallada): Float64Array {
  const n = m.vertices.length / 3, uv = new Float64Array(2 * n);
  for (let i = 0; i < n; i++) {
    uv[2 * i] = m.vertices[3 * i];
    uv[2 * i + 1] = m.vertices[3 * i + 2];
  }
  return uv;
}

/** La urdimbre de la pieza: la dirección de su línea de grano en el dibujo; sin línea, el motor la pone vertical (§4.1.2). */
export function hiloDe(p: PatternPiece): readonly [number, number] | undefined {
  const linea = p.internals?.find((l) => l.type === 'grainline');
  const puntas = linea ? grainlineEndpoints(linea.path) : null;
  if (!puntas) return undefined;
  const dx = puntas[1].x - puntas[0].x, dy = puntas[1].y - puntas[0].y;
  return Math.hypot(dx, dy) > 0 ? [dx, dy] : undefined;
}

/** Las posiciones iniciales (m) de cada pieza, 3 por vértice de su malla. */
export type Colocacion = (piezas: readonly PatternPiece[], mallas: readonly PiezaMallada[]) => Float64Array[];

export interface Camiseta {
  piezas: PatternPiece[];
  mallas: PiezaMallada[];
  prenda: Prenda;
  costuras: { puntos: PuntoDeCostura[]; bisagras: BisagraDeCostura[] };
  lados: LadosDeCostura[];
  franja: Uint8Array;
}

export function camisetaDeMaria(dxf: string, aristaMm: number, tela: TelaFisica, colocar: Colocacion): Camiseta {
  const piezas = piezasDeMaria(dxf);
  const mallas = mallarPiezas(piezas, aristaMm);
  const pares = seamInitDataToPairs(seamsToInitData(costurasDeMaria(piezas)), mallas);
  const x = colocar(piezas, mallas);
  const prenda = armarPrenda(piezas.map((p, k) => ({
    id: p.id, x: x[k], patron: patronDe(mallas[k]), tris: mallas[k].triIds, hilo: hiloDe(p), margenMm: p.seamAllowance,
  })));
  const { puntos, lados } = costurasDePrenda(prenda, pares);
  return { piezas, mallas, prenda, costuras: { puntos, bisagras: bisagrasDePrenda(prenda, lados, tela) }, lados, franja: franjaDePrenda(prenda, lados) };
}
