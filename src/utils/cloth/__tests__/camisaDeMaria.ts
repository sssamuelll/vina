/**
 * La camisa de María para las pruebas (tests/fixtures/garments/maria_patrones_samuel_2M.dxf): importada y
 * clasificada como al importar en la app, cosida con autoSew más refineSeamsInWorld, y mallada como la
 * malla el simulador. El mismo recorrido de seamCoverage.maria.test.ts.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { importDXFContent } from '../../dxf';
import { classifyPiecesGeometric } from '../../geometricClassifier';
import { detectSemanticEdges } from '../../semanticEdges';
import { autoSew } from '../../autoSew';
import { refineSeamsInWorld } from '../../autoSew/worldRefine';
import { resolveArrangementWithFrames } from '../arrangement/arrangementBinding';
import { meshPiece } from '../../mesh';
import { seamsToInitData } from '../../../components/Viewport3D/costurasDeLaSimulacion';
import type { PieceWithOutline } from '../seamPairs';
import type { BodyMeasurements, PatternPiece, Seam } from '../../../types/types';

const DXF = resolve(__dirname, '../../../../tests/fixtures/garments/maria_patrones_samuel_2M.dxf');

export const MEDIDAS_DE_MARIA = { height: 180, chest: 96, waist: 82, hips: 96, shoulder: 44, armLength: 64, inseam: 82 } as BodyMeasurements;

export function importarMariaClasificada(): PatternPiece[] {
  const piezas = importDXFContent(readFileSync(DXF, 'utf-8'), { unit: 'auto', autoDetect: true }).pieces;
  const clases = classifyPiecesGeometric(piezas);
  for (const p of piezas) {
    const c = clases.get(p.id)!;
    if (c.category !== 'other') {
      p.category = c.category;
      if (c.side) p.side = c.side;
    }
    p.edges = detectSemanticEdges(p);
  }
  return piezas;
}

export function costurasDeMaria(piezas: PatternPiece[]): Seam[] {
  return refineSeamsInWorld(
    autoSew(piezas, { minConfidence: 0.3 }).seams.map((s) => s.seam),
    piezas,
    resolveArrangementWithFrames(piezas, MEDIDAS_DE_MARIA, undefined),
  );
}

/** El mismo mapeo que manda la app (costurasDeLaSimulacion.ts, seamsToInitData). */
export const aInitData = (costuras: Seam[]) => seamsToInitData(costuras);

/** Las piezas malladas con las opciones de SimulationInitClient.meshPiece, listas para seamInitDataToPairs. */
export function mallarParaCoser(piezas: PatternPiece[], aristaMm: number): Array<PieceWithOutline & { triIds: Int32Array; uvs?: Float32Array }> {
  return piezas.map((p) => {
    const m = meshPiece(p, { yHeight: 0, scale: 0.001, maxEdgeLength: aristaMm, minAngle: 25, maxRefinementPasses: 3, curveResolution: 12 });
    return {
      pieceId: p.id, vertices: m.vertices, triIds: m.triIds, uvs: m.uvs,
      outline: p.outline, edges: p.edges, boundaryOrig: m.boundaryOrig, meshMaxEdgeLength: aristaMm,
    };
  });
}
