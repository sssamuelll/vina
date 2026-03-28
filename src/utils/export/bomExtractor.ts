/**
 * BOM Extractor — Pure Functions
 *
 * Extracts Bill of Materials entries from project state.
 * All functions are pure: (state) → BOMEntry[], no side effects.
 */

import type { PatternPiece, Fabric, Seam, Elastic, Point2D } from '../../types/types';
import type { BOMEntry } from '../../types/bom';
import { flattenPath } from '../seam/index';

// ─── Geometry Helpers ───

/**
 * Compute polygon area via the Shoelace formula.
 * Input points in mm, returns area in mm².
 */
function shoelaceArea(points: Point2D[]): number {
  const n = points.length;
  if (n < 3) return 0;

  let area = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  return Math.abs(area) / 2;
}

/**
 * Compute perimeter of a polygon.
 * Input points in mm, returns perimeter in mm.
 */
function computePerimeter(points: Point2D[]): number {
  const n = points.length;
  if (n < 2) return 0;

  let perimeter = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dx = points[j].x - points[i].x;
    const dy = points[j].y - points[i].y;
    perimeter += Math.sqrt(dx * dx + dy * dy);
  }
  return perimeter;
}

/**
 * Remove closing duplicate from a flattened path if present.
 */
function dedup(points: Point2D[]): Point2D[] {
  if (points.length < 2) return points;
  const first = points[0];
  const last = points[points.length - 1];
  if (Math.abs(first.x - last.x) < 0.001 && Math.abs(first.y - last.y) < 0.001) {
    return points.slice(0, -1);
  }
  return points;
}

/**
 * Compute the area of a piece's outline in m².
 * Accounts for mirrored pieces (×2).
 */
function pieceAreaM2(piece: PatternPiece): number {
  const pts = dedup(flattenPath(piece.outline));
  const areaMM2 = shoelaceArea(pts);
  const multiplier = piece.mirrored ? 2 : 1;
  return (areaMM2 * multiplier) / 1_000_000; // mm² → m²
}

/**
 * Compute the length of an edge segment on a piece, in mm.
 * Falls back to 1/4 of perimeter if the edge is not found.
 */
function edgeLengthMM(
  piece: PatternPiece,
  edgeName: string,
  tStart?: number,
  tEnd?: number,
): number {
  const pts = dedup(flattenPath(piece.outline));
  const edge = piece.edges?.find((e) => e.name === edgeName);

  if (edge) {
    const [start, end] = edge.segmentRange;
    // Walk the flattened outline from start to end index, summing segment lengths
    let length = 0;
    for (let i = start; i < end && i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      const dx = pts[j].x - pts[i].x;
      const dy = pts[j].y - pts[i].y;
      length += Math.sqrt(dx * dx + dy * dy);
    }

    // Apply tStart/tEnd as fraction of the full edge length
    const t0 = tStart ?? 0;
    const t1 = tEnd ?? 1;
    return length * (t1 - t0);
  }

  // Fallback: 1/4 of perimeter
  return computePerimeter(pts) / 4;
}

/**
 * Compute the length of a seam (from pieceA's edge) in mm.
 */
function seamLengthMM(seam: Seam, pieceMap: Map<string, PatternPiece>): number {
  const piece = pieceMap.get(seam.pieceA.pieceId);
  if (!piece) return 0;
  return edgeLengthMM(piece, seam.pieceA.edgeName, seam.pieceA.tStart, seam.pieceA.tEnd);
}

// ─── Thread Multipliers ───

const THREAD_MULTIPLIERS: Record<Seam['type'], number> = {
  standard: 2.5,
  french: 5.0,
  'flat-felled': 5.0,
  overlock: 4.0,
};

// ─── ID Generation ───

let _idCounter = 0;
function nextId(prefix: string): string {
  return `${prefix}-${++_idCounter}`;
}

/** Reset ID counter (for testing determinism) */
export function _resetIdCounter(): void {
  _idCounter = 0;
}

// ─── Shared Entry Builder ───

function makeEntry(partial: Omit<BOMEntry, 'unitCost' | 'currency' | 'colorwayOverrides' | 'autoPopulated'> & Partial<BOMEntry>): BOMEntry {
  return {
    unitCost: 0,
    currency: 'USD',
    colorwayOverrides: {},
    autoPopulated: true,
    ...partial,
  };
}

// ─── Extractors ───

/**
 * Extract fabric BOM entries.
 * Groups pieces by fabricCode, sums area (shoelace), accounts for mirrored (×2).
 * Converts mm² → m².
 */
export function extractFabrics(
  pieces: PatternPiece[],
  _fabrics: Fabric[],
): BOMEntry[] {
  if (pieces.length === 0) return [];

  const groups = new Map<string, { area: number; pieceIds: string[] }>();

  for (const piece of pieces) {
    const code = piece.fabricCode || 'Unassigned';
    const group = groups.get(code) || { area: 0, pieceIds: [] };
    group.area += pieceAreaM2(piece);
    group.pieceIds.push(piece.id);
    groups.set(code, group);
  }

  const entries: BOMEntry[] = [];
  for (const [code, group] of groups) {
    entries.push(
      makeEntry({
        id: nextId('bom-fabric'),
        category: 'fabric',
        name: `Fabric — ${code}`,
        description: `Total fabric for ${code} pieces`,
        quantity: group.area,
        unit: 'meters',
        sourcePieceIds: group.pieceIds,
      }),
    );
  }

  return entries;
}

/**
 * Extract interfacing BOM entries.
 * Filters pieces with interfacingType, groups by type, sums areas.
 */
export function extractInterfacing(pieces: PatternPiece[]): BOMEntry[] {
  const groups = new Map<string, { area: number; pieceIds: string[] }>();

  for (const piece of pieces) {
    const iType = piece.interfacingType;
    if (!iType || iType === 'none') continue;

    const group = groups.get(iType) || { area: 0, pieceIds: [] };
    group.area += pieceAreaM2(piece);
    group.pieceIds.push(piece.id);
    groups.set(iType, group);
  }

  const entries: BOMEntry[] = [];
  for (const [iType, group] of groups) {
    entries.push(
      makeEntry({
        id: nextId('bom-interfacing'),
        category: 'interfacing',
        name: `Interfacing — ${iType}`,
        description: `${iType} interfacing`,
        quantity: group.area,
        unit: 'meters',
        sourcePieceIds: group.pieceIds,
      }),
    );
  }

  return entries;
}

/**
 * Extract thread BOM entries.
 * Calculates seam lengths, applies thread multiplier by seam type.
 */
export function extractThread(seams: Seam[], pieces: PatternPiece[]): BOMEntry[] {
  const activeSeams = seams.filter((s) => s.active);
  if (activeSeams.length === 0) return [];

  const pieceMap = new Map<string, PatternPiece>();
  for (const p of pieces) pieceMap.set(p.id, p);

  // Sum thread by seam type
  const groups = new Map<string, { lengthMM: number; pieceIds: Set<string> }>();

  for (const seam of activeSeams) {
    const lengthMM = seamLengthMM(seam, pieceMap);
    const multiplier = THREAD_MULTIPLIERS[seam.type] ?? 2.5;
    const threadMM = lengthMM * multiplier;

    const key = seam.type;
    const group = groups.get(key) || { lengthMM: 0, pieceIds: new Set<string>() };
    group.lengthMM += threadMM;
    group.pieceIds.add(seam.pieceA.pieceId);
    group.pieceIds.add(seam.pieceB.pieceId);
    groups.set(key, group);
  }

  const entries: BOMEntry[] = [];
  for (const [type, group] of groups) {
    entries.push(
      makeEntry({
        id: nextId('bom-thread'),
        category: 'thread',
        name: `Thread — ${type}`,
        description: `Thread for ${type} seams (${THREAD_MULTIPLIERS[type as Seam['type']] ?? 2.5}× multiplier)`,
        quantity: group.lengthMM / 1000, // mm → m
        unit: 'meters',
        sourcePieceIds: [...group.pieceIds],
      }),
    );
  }

  return entries;
}

/**
 * Extract seam tape BOM entries.
 * Filters taped seams, sums lengths grouped by tapeWidth.
 */
export function extractSeamTape(seams: Seam[], pieces: PatternPiece[]): BOMEntry[] {
  const tapedSeams = seams.filter((s) => s.active && s.taped);
  if (tapedSeams.length === 0) return [];

  const pieceMap = new Map<string, PatternPiece>();
  for (const p of pieces) pieceMap.set(p.id, p);

  const groups = new Map<number, { lengthMM: number; pieceIds: Set<string> }>();

  for (const seam of tapedSeams) {
    const lengthMM = seamLengthMM(seam, pieceMap);
    const width = seam.tapeWidth;

    const group = groups.get(width) || { lengthMM: 0, pieceIds: new Set<string>() };
    group.lengthMM += lengthMM;
    group.pieceIds.add(seam.pieceA.pieceId);
    group.pieceIds.add(seam.pieceB.pieceId);
    groups.set(width, group);
  }

  const entries: BOMEntry[] = [];
  for (const [width, group] of groups) {
    entries.push(
      makeEntry({
        id: nextId('bom-tape'),
        category: 'seam-tape',
        name: `Seam Tape — ${width}mm`,
        description: `${width}mm seam tape`,
        quantity: group.lengthMM / 1000, // mm → m
        unit: 'meters',
        sourcePieceIds: [...group.pieceIds],
      }),
    );
  }

  return entries;
}

/**
 * Extract elastic BOM entries.
 * Groups by elastic type, estimates lengths from edge segments.
 */
export function extractElastics(elastics: Elastic[], pieces: PatternPiece[]): BOMEntry[] {
  const activeElastics = elastics.filter((e) => e.active);
  if (activeElastics.length === 0) return [];

  const pieceMap = new Map<string, PatternPiece>();
  for (const p of pieces) pieceMap.set(p.id, p);

  const groups = new Map<string, { lengthMM: number; pieceIds: Set<string> }>();

  for (const elastic of activeElastics) {
    const piece = pieceMap.get(elastic.pieceId);
    if (!piece) continue;

    const lengthMM = edgeLengthMM(piece, elastic.edgeName, elastic.tStart, elastic.tEnd);
    const key = elastic.type;

    const group = groups.get(key) || { lengthMM: 0, pieceIds: new Set<string>() };
    group.lengthMM += lengthMM;
    group.pieceIds.add(elastic.pieceId);
    groups.set(key, group);
  }

  const entries: BOMEntry[] = [];
  for (const [type, group] of groups) {
    entries.push(
      makeEntry({
        id: nextId('bom-elastic'),
        category: 'elastic',
        name: `Elastic — ${type}`,
        description: `${type} elastic`,
        quantity: group.lengthMM / 1000, // mm → m
        unit: 'meters',
        sourcePieceIds: [...group.pieceIds],
      }),
    );
  }

  return entries;
}

/**
 * Extract trim BOM entries.
 * Stub — returns empty array (future: buttons, zippers, etc.).
 */
export function extractTrims(): BOMEntry[] {
  return [];
}

/**
 * Extract all BOM entries from project state.
 * Combines fabric, interfacing, thread, seam tape, elastic, and trim entries.
 */
export function extractAll(
  pieces: PatternPiece[],
  fabrics: Fabric[],
  seams: Seam[],
  elastics: Elastic[],
): BOMEntry[] {
  return [
    ...extractFabrics(pieces, fabrics),
    ...extractInterfacing(pieces),
    ...extractThread(seams, pieces),
    ...extractSeamTape(seams, pieces),
    ...extractElastics(elastics, pieces),
    ...extractTrims(),
  ];
}
