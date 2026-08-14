/**
 * BOM (Bill of Materials) CSV Export
 *
 * Generates a CSV bill of materials from pattern pieces, seams, and fabrics.
 * Includes per-piece metrics (area, perimeter, dimensions) and a summary row.
 */

import type { PathCommand, Point2D, Seam } from '../../types/types';
import { flattenPath } from '../seam/index';
import { computeBBoxFromPoints } from './pipeline';

// ─── Types ───

/** Minimal piece interface for BOM generation (subset of PatternPiece) */
export interface BOMPiece {
  id: string;
  name: string;
  outline: PathCommand[];
  seamAllowance: number;
  fabricId?: string;
  mirrored: boolean;
  grainLine?: { angle: number };
  /** Legacy field — used if grainLine is absent */
  grainAngle?: number;
}

/** Minimal fabric lookup for BOM */
export interface BOMFabric {
  id: string;
  name: string;
}

// ─── Helpers ───

/**
 * Escape a value for CSV: wrap in quotes if it contains commas, quotes, or newlines.
 */
export function escapeCSV(value: string): string {
  if (value.includes('"') || value.includes(',') || value.includes('\n') || value.includes('\r')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

/**
 * Compute polygon area using the Shoelace formula.
 * Input points in mm, returns area in mm^2.
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
 * Compute perimeter of a polygon from its vertices.
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
 * Resolve the grain direction string for a piece.
 */
function resolveGrainDirection(piece: BOMPiece): string {
  const angle = piece.grainLine?.angle ?? piece.grainAngle ?? 0;
  if (angle === 0) return 'Lengthwise (0\u00B0)';
  if (angle === 90) return 'Crosswise (90\u00B0)';
  if (angle === 45) return 'Bias (45\u00B0)';
  return `${angle}\u00B0`;
}

// ─── CSV Header ───

const CSV_HEADER = [
  'Piece Name',
  'Fabric',
  'Cut Count',
  'Grain Direction',
  'Area (cm2)',
  'Seam Allowance (mm)',
  'Width (cm)',
  'Height (cm)',
  'Perimeter (cm)',
].map(escapeCSV).join(',');

// ─── Main Export ───

/**
 * Generate a BOM CSV string from pattern pieces, seams, and fabrics.
 *
 * @param pieces  Array of pattern pieces (or minimal BOMPiece objects)
 * @param seams   Array of seams (reserved for future use, e.g. seam type summary)
 * @param fabrics Array of fabrics for name lookups
 * @returns       CSV string with header, data rows sorted by fabric, and a TOTAL summary row
 */
export function generateBOM(
  pieces: BOMPiece[],
  _seams: Seam[],
  fabrics: BOMFabric[],
): string {
  const fabricMap = new Map<string, string>();
  for (const f of fabrics) {
    fabricMap.set(f.id, f.name);
  }

  // Sort pieces by fabricId for grouping
  const sorted = [...pieces].sort((a, b) => {
    const fa = a.fabricId ?? '';
    const fb = b.fabricId ?? '';
    return fa.localeCompare(fb);
  });

  const lines: string[] = [CSV_HEADER];
  let totalArea = 0;
  let totalPerimeter = 0;

  for (const piece of sorted) {
    const flat = flattenPath(piece.outline);

    // Remove closing duplicate if present (flattenPath adds start point on Z)
    const pts = (flat.length > 1 &&
      Math.abs(flat[0].x - flat[flat.length - 1].x) < 0.001 &&
      Math.abs(flat[0].y - flat[flat.length - 1].y) < 0.001)
      ? flat.slice(0, -1)
      : flat;

    const areaMM2 = shoelaceArea(pts);
    const areaCM2 = areaMM2 / 100; // mm^2 -> cm^2
    const perimeterMM = computePerimeter(pts);
    const perimeterCM = perimeterMM / 10; // mm -> cm

    const bbox = computeBBoxFromPoints(pts);
    const widthCM = bbox.width / 10;
    const heightCM = bbox.height / 10;

    const fabricName = fabricMap.get(piece.fabricId ?? '') ?? (piece.fabricId ?? 'Sin asignar');
    const cutCount = piece.mirrored ? 2 : 1;
    const grainDir = resolveGrainDirection(piece);

    const row = [
      escapeCSV(piece.name),
      escapeCSV(fabricName),
      String(cutCount),
      escapeCSV(grainDir),
      areaCM2.toFixed(1),
      String(piece.seamAllowance),
      widthCM.toFixed(1),
      heightCM.toFixed(1),
      perimeterCM.toFixed(1),
    ].join(',');

    lines.push(row);
    totalArea += areaCM2;
    totalPerimeter += perimeterCM;
  }

  // Summary row
  const totalRow = [
    escapeCSV('TOTAL'),
    '', // fabric
    String(sorted.reduce((sum, p) => sum + (p.mirrored ? 2 : 1), 0)),
    '', // grain
    totalArea.toFixed(1),
    '', // seam allowance
    '', // width
    '', // height
    totalPerimeter.toFixed(1),
  ].join(',');

  lines.push(totalRow);

  return lines.join('\n') + '\n';
}

/**
 * Trigger a browser download of the BOM CSV.
 */
export function downloadBOM(
  pieces: BOMPiece[],
  _seams: Seam[],
  fabrics: BOMFabric[],
  filename = 'bill-of-materials.csv',
): void {
  const csv = generateBOM(pieces, _seams, fabrics);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
