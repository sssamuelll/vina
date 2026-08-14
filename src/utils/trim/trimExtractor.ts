// src/utils/trim/trimExtractor.ts
import type { PatternPiece } from '../../types/types';
import type { Trim, TrimType } from '../../types/trim';
import { flattenPath } from '../seam/index';

function computePerimeter(points: { x: number; y: number }[]): number {
  let perimeter = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    const dx = points[j].x - points[i].x;
    const dy = points[j].y - points[i].y;
    perimeter += Math.sqrt(dx * dx + dy * dy);
  }
  return perimeter;
}

function edgeLengthMM(piece: PatternPiece, edgeName: string, tStart: number, tEnd: number): number {
  const pts = flattenPath(piece.outline);
  const edge = piece.edges?.find(e => e.name === edgeName);
  if (!edge) {
    // Fallback: fraction of perimeter
    return computePerimeter(pts) / 4 * (tEnd - tStart);
  }
  const n = pts.length;
  const start = Math.max(0, Math.min(edge.segmentRange[0], n - 1));
  const end = Math.max(0, Math.min(edge.segmentRange[1], n - 1));
  let len = 0;
  let i = start;
  while (i !== end && len < 100000) {
    const next = (i + 1) % n;
    const dx = pts[next].x - pts[i].x;
    const dy = pts[next].y - pts[i].y;
    len += Math.sqrt(dx * dx + dy * dy);
    i = next;
  }
  return len * (tEnd - tStart);
}

export interface TrimBOMEntry {
  id: string;
  category: 'trim';
  name: string;
  description: string;
  quantity: number;
  unit: 'pieces' | 'meters';
  unitCost: number;
  currency: string;
  colorwayOverrides: Record<string, never>;
  autoPopulated: boolean;
  sourcePieceIds: string[];
}

/** Etiquetas visibles de los tipos de avío. Exportado para que los tests se
 *  aten al mapa y no a la cadena: el enum es la identidad, el texto es solo
 *  presentación y se traduce (contrato de interfaz, 2026-08-14). */
export const TRIM_TYPE_LABELS: Record<TrimType, string> = {
  button: 'botón',
  zipper: 'cierre',
  snap: 'broche',
  rivet: 'remache',
  buckle: 'hebilla',
  ring: 'aro',
  'hook-eye': 'corchete',
  'drawstring-stop': 'tope de cordón',
  custom: 'personalizado',
};

export function extractTrims(trims: Trim[], pieces: PatternPiece[]): TrimBOMEntry[] {
  const active = trims.filter(t => t.active);
  if (active.length === 0) return [];

  const pieceMap = new Map<string, PatternPiece>();
  for (const p of pieces) pieceMap.set(p.id, p);

  const countGroups = new Map<string, { quantity: number; unitCost: number; pieceIds: Set<string>; name: string; type: string }>();
  const edgeGroups = new Map<string, { lengthMM: number; unitCost: number; pieceIds: Set<string>; name: string; type: string }>();

  for (const trim of active) {
    const key = `${trim.type}::${trim.name}`;
    const piece = pieceMap.get(trim.pieceId);

    if (trim.placement.mode === 'count') {
      const g = countGroups.get(key) ?? { quantity: 0, unitCost: trim.unitCost, pieceIds: new Set(), name: trim.name, type: trim.type };
      g.quantity += trim.placement.quantity;
      g.pieceIds.add(trim.pieceId);
      countGroups.set(key, g);
    } else if (trim.placement.mode === 'edge' && piece) {
      const len = edgeLengthMM(piece, trim.placement.edgeName, trim.placement.tStart, trim.placement.tEnd);
      const g = edgeGroups.get(key) ?? { lengthMM: 0, unitCost: trim.unitCost, pieceIds: new Set(), name: trim.name, type: trim.type };
      g.lengthMM += len;
      g.pieceIds.add(trim.pieceId);
      edgeGroups.set(key, g);
    } else if (trim.placement.mode === 'point') {
      const g = countGroups.get(key) ?? { quantity: 0, unitCost: trim.unitCost, pieceIds: new Set(), name: trim.name, type: trim.type };
      g.quantity += trim.placement.positions.length;
      g.pieceIds.add(trim.pieceId);
      countGroups.set(key, g);
    } else if (trim.placement.mode === 'edge-points') {
      const g = countGroups.get(key) ?? { quantity: 0, unitCost: trim.unitCost, pieceIds: new Set(), name: trim.name, type: trim.type };
      g.quantity += trim.placement.positions.length;
      g.pieceIds.add(trim.pieceId);
      countGroups.set(key, g);
    }
  }

  const entries: TrimBOMEntry[] = [];

  for (const [, g] of countGroups) {
    entries.push({
      id: crypto.randomUUID(),
      category: 'trim',
      name: `${TRIM_TYPE_LABELS[g.type as TrimType] ?? g.type} \u2014 ${g.name}`,
      description: `${g.quantity} \u00d7 ${g.name}`,
      quantity: g.quantity,
      unit: 'pieces',
      unitCost: g.unitCost,
      currency: 'USD',
      colorwayOverrides: {},
      autoPopulated: true,
      sourcePieceIds: [...g.pieceIds],
    });
  }

  for (const [, g] of edgeGroups) {
    entries.push({
      id: crypto.randomUUID(),
      category: 'trim',
      name: `${TRIM_TYPE_LABELS[g.type as TrimType] ?? g.type} \u2014 ${g.name}`,
      description: `${g.name} a lo largo del borde`,
      quantity: Math.round((g.lengthMM / 1000) * 100) / 100,
      unit: 'meters',
      unitCost: g.unitCost,
      currency: 'USD',
      colorwayOverrides: {},
      autoPopulated: true,
      sourcePieceIds: [...g.pieceIds],
    });
  }

  return entries;
}
