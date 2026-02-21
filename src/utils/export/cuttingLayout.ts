/**
 * Cutting Layout Engine — computes optimally nested piece placements on paper sheets.
 *
 * Supports A0, A1, A4, and custom paper sizes. Optionally tiles large sheets
 * into A4 pages with overlap and alignment marks.
 */

import type { PatternPiece, Point2D } from '../../types/types';
import type { Seam } from '../../types/types'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { flattenPath, generateSeamAllowance } from '../seam/index';
import { nestPieces, computeArea } from '../nesting/nestingEngine';
import type { NestingOptions } from '../nesting/types';

// ─── Paper Sizes (mm) ───

export const PAPER_SIZES = {
  A0: { width: 841, height: 1189 },
  A1: { width: 594, height: 841 },
  A4: { width: 210, height: 297 },
  CUSTOM: null,
} as const;

export type PaperSize = keyof typeof PAPER_SIZES;

// ─── Interfaces ───

export interface CuttingLayoutConfig {
  paperSize: PaperSize;
  customWidth?: number;
  customHeight?: number;
  margin: number;
  scale: number;
  includeSeamAllowance: boolean;
  includeGrainline: boolean;
  includeNotches: boolean;
  includeLabels: boolean;
  tileToA4: boolean;
}

export interface LayoutResult {
  pages: LayoutPage[];
  fabricUtilization: number;
  totalFabricArea: number;
  totalPieceArea: number;
}

export interface LayoutPage {
  pageNumber: number;
  width: number;
  height: number;
  pieces: PlacedPiece[];
  tileRow?: number;
  tileCol?: number;
}

export interface PlacedPiece {
  pieceId: string;
  pieceName: string;
  outline: number[];
  seamAllowance?: number[];
  grainline?: { start: [number, number]; end: [number, number] };
  notches?: Array<{ position: [number, number]; type: string }>;
  rotation: number;
  position: [number, number];
}

export const DEFAULT_CONFIG: CuttingLayoutConfig = {
  paperSize: 'A0',
  margin: 10,
  scale: 1.0,
  includeSeamAllowance: true,
  includeGrainline: true,
  includeNotches: true,
  includeLabels: true,
  tileToA4: false,
};

// ─── Helpers ───

function getPaperDimensions(config: CuttingLayoutConfig): { width: number; height: number } {
  if (config.paperSize === 'CUSTOM') {
    return {
      width: config.customWidth ?? 841,
      height: config.customHeight ?? 1189,
    };
  }
  const size = PAPER_SIZES[config.paperSize];
  return { width: size!.width, height: size!.height };
}

/** Flatten outline points to a flat number array [x0,y0, x1,y1, ...] */
function flattenToArray(points: Point2D[]): number[] {
  const arr: number[] = [];
  for (const p of points) {
    arr.push(p.x, p.y);
  }
  return arr;
}

/** Apply rotation + translation to flat coordinate array */
function transformCoords(
  flat: number[],
  rotation: number,
  tx: number,
  ty: number,
  scale: number,
): number[] {
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const result: number[] = [];

  // First rotate, compute bbox to normalize to origin, then translate
  const rotated: number[] = [];
  for (let i = 0; i < flat.length; i += 2) {
    const x = flat[i] * scale;
    const y = flat[i + 1] * scale;
    rotated.push(x * cos - y * sin, x * sin + y * cos);
  }

  // Find min to normalize
  let minX = Infinity, minY = Infinity;
  for (let i = 0; i < rotated.length; i += 2) {
    if (rotated[i] < minX) minX = rotated[i];
    if (rotated[i + 1] < minY) minY = rotated[i + 1];
  }

  for (let i = 0; i < rotated.length; i += 2) {
    result.push(rotated[i] - minX + tx, rotated[i + 1] - minY + ty);
  }

  return result;
}

// ─── Main Layout Function ───

export function computeCuttingLayout(
  pieces: PatternPiece[],
  _seams: Seam[],
  config: CuttingLayoutConfig,
): LayoutResult {
  if (pieces.length === 0) {
    return { pages: [], fabricUtilization: 0, totalFabricArea: 0, totalPieceArea: 0 };
  }

  const { width: paperW, height: paperH } = getPaperDimensions(config);
  const { margin, scale } = config;

  // Prepare pieces for nesting — use SA outlines if requested for bounding
  const nestingOptions: NestingOptions = {
    sheet: { width: paperW, height: paperH, margin },
    gap: 2,
    rotationStep: 90,
    allowMirror: false,
    sortStrategy: 'area-desc',
  };

  const nestResult = nestPieces(pieces, nestingOptions);

  // Build pages from nesting result
  const pageMap = new Map<number, PlacedPiece[]>();

  for (const placement of nestResult.placements) {
    const piece = pieces.find(p => p.id === placement.pieceId);
    if (!piece) continue;

    const outlinePoints = flattenPath(piece.outline);
    const outlineFlat = flattenToArray(outlinePoints);

    // Compute SA outline if needed
    let saFlat: number[] | undefined;
    if (config.includeSeamAllowance && piece.seamAllowance > 0) {
      const saCommands = generateSeamAllowance(piece.outline, piece.seamAllowance);
      if (saCommands.length > 0) {
        const saPoints = flattenPath(saCommands);
        saFlat = flattenToArray(saPoints);
      }
    }

    // Grainline
    let grainline: PlacedPiece['grainline'];
    if (config.includeGrainline) {
      const gl = piece.internals.find(i => i.type === 'grainline');
      if (gl && gl.path.length >= 2) {
        const pts = flattenPath(gl.path);
        if (pts.length >= 2) {
          grainline = {
            start: [pts[0].x, pts[0].y],
            end: [pts[pts.length - 1].x, pts[pts.length - 1].y],
          };
        }
      }
    }

    // Notches
    let notches: PlacedPiece['notches'];
    if (config.includeNotches) {
      const notchInternals = piece.internals.filter(i => i.type === 'notch');
      if (notchInternals.length > 0) {
        notches = notchInternals.map(n => {
          const pts = flattenPath(n.path);
          const mid = pts[Math.floor(pts.length / 2)] ?? pts[0];
          return {
            position: [mid.x, mid.y] as [number, number],
            type: n.notchOptions?.shape ?? 'slit',
          };
        });
      }
    }

    const transformedOutline = transformCoords(
      outlineFlat, placement.rotation, placement.x, placement.y, scale,
    );

    const transformedSA = saFlat
      ? transformCoords(saFlat, placement.rotation, placement.x, placement.y, scale)
      : undefined;

    const placed: PlacedPiece = {
      pieceId: piece.id,
      pieceName: piece.name,
      outline: transformedOutline,
      seamAllowance: transformedSA,
      grainline,
      notches,
      rotation: placement.rotation,
      position: [placement.x, placement.y],
    };

    if (!pageMap.has(placement.sheetIndex)) {
      pageMap.set(placement.sheetIndex, []);
    }
    pageMap.get(placement.sheetIndex)!.push(placed);
  }

  // Build pages
  const pages: LayoutPage[] = [];
  const sortedSheets = [...pageMap.keys()].sort((a, b) => a - b);

  for (let i = 0; i < sortedSheets.length; i++) {
    pages.push({
      pageNumber: i + 1,
      width: paperW,
      height: paperH,
      pieces: pageMap.get(sortedSheets[i]) || [],
    });
  }

  // If no pieces were placed but sheets exist, ensure at least empty pages
  if (pages.length === 0 && nestResult.sheetsUsed > 0) {
    for (let i = 0; i < nestResult.sheetsUsed; i++) {
      pages.push({ pageNumber: i + 1, width: paperW, height: paperH, pieces: [] });
    }
  }

  // Compute areas
  const totalPieceArea = pieces
    .filter(p => !nestResult.unplaced.includes(p.id))
    .reduce((sum, p) => sum + computeArea(p.outline) * scale * scale, 0);
  const totalFabricArea = pages.length * paperW * paperH;
  const fabricUtilization = totalFabricArea > 0 ? totalPieceArea / totalFabricArea : 0;

  let result: LayoutResult = { pages, fabricUtilization, totalFabricArea, totalPieceArea };

  // Tile to A4 if requested
  if (config.tileToA4 && config.paperSize !== 'A4') {
    result = tileToA4(result, config);
  }

  return result;
}

// ─── A4 Tiling ───

const A4_OVERLAP = 10; // mm

export function tileToA4(layout: LayoutResult, _config?: CuttingLayoutConfig): LayoutResult {
  const a4W = PAPER_SIZES.A4.width;
  const a4H = PAPER_SIZES.A4.height;
  const effectiveW = a4W - A4_OVERLAP;
  const effectiveH = a4H - A4_OVERLAP;

  const tiledPages: LayoutPage[] = [];
  let pageNum = 1;

  for (const page of layout.pages) {
    const cols = Math.ceil(page.width / effectiveW);
    const rows = Math.ceil(page.height / effectiveH);

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const tileX = col * effectiveW;
        const tileY = row * effectiveH;

        // Filter and clip pieces to this tile region
        const tilePieces: PlacedPiece[] = [];
        for (const piece of page.pieces) {
          // Check if any point of the outline falls within tile bounds
          const outline = piece.outline;
          let inTile = false;
          for (let i = 0; i < outline.length; i += 2) {
            const px = outline[i];
            const py = outline[i + 1];
            if (px >= tileX && px <= tileX + a4W && py >= tileY && py <= tileY + a4H) {
              inTile = true;
              break;
            }
          }

          if (inTile) {
            // Shift coordinates relative to tile origin
            const shiftedOutline: number[] = [];
            for (let i = 0; i < outline.length; i += 2) {
              shiftedOutline.push(outline[i] - tileX, outline[i + 1] - tileY);
            }

            let shiftedSA: number[] | undefined;
            if (piece.seamAllowance) {
              shiftedSA = [];
              for (let i = 0; i < piece.seamAllowance.length; i += 2) {
                shiftedSA.push(piece.seamAllowance[i] - tileX, piece.seamAllowance[i + 1] - tileY);
              }
            }

            tilePieces.push({
              ...piece,
              outline: shiftedOutline,
              seamAllowance: shiftedSA,
              position: [piece.position[0] - tileX, piece.position[1] - tileY],
            });
          }
        }

        tiledPages.push({
          pageNumber: pageNum++,
          width: a4W,
          height: a4H,
          pieces: tilePieces,
          tileRow: row,
          tileCol: col,
        });
      }
    }
  }

  return {
    ...layout,
    pages: tiledPages,
  };
}
