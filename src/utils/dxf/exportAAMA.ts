/**
 * AAMA/ASTM D6673 compliant DXF export.
 * 
 * Features:
 * - Numbered AAMA layers: 1 (cut), 4 (notch), 7 (grainline), 8 (draw), 11 (intcut)
 * - Each piece = BLOCK + INSERT reference
 * - Cubic beziers exported as SPLINE entities (degree 3)
 * - BLOCK_RECORD in TABLES (R2000+)
 * - Text height = 2.5 (AAMA standard)
 * - Supports R12 (POLYLINE) and R2000+ (LWPOLYLINE)
 */
import { PatternPiece, PathCommand } from '../../types/types';
import { AAMA_LAYERS, DXFExportOptions } from './types';
import { preparePieces, computeBBox } from '../export/pipeline';
import { escapeDxfString } from '../sanitizeName';

const DEFAULT_OPTIONS: DXFExportOptions = { version: 'R2000', aamaLayers: true };

// ─── Handle counter for R2000+ ───

let handleCounter = 0;
function nextHandle(): string {
  return (++handleCounter).toString(16).toUpperCase();
}
function resetHandles() { handleCounter = 0x100; }

// ─── Header ───

function dxfHeader(): string {
  return `0
SECTION
2
HEADER
9
$ACADVER
1
AC1015
9
$INSUNITS
70
4
9
$MEASUREMENT
70
1
9
$CLAYER
8
${AAMA_LAYERS.CUT}
0
ENDSEC
`;
}

// ─── Tables ───

function dxfTables(pieces: PatternPiece[], opts: DXFExportOptions): string {
  let s = `0
SECTION
2
TABLES
`;
  // LAYER table
  s += `0
TABLE
2
LAYER
5
${nextHandle()}
`;
  const layers = [
    { name: AAMA_LAYERS.CUT, color: 7, lt: 'CONTINUOUS' },
    { name: AAMA_LAYERS.NOTCH, color: 1, lt: 'CONTINUOUS' },
    { name: AAMA_LAYERS.GRAINLINE, color: 3, lt: 'CONTINUOUS' },
    { name: AAMA_LAYERS.DRAW, color: 4, lt: 'CONTINUOUS' },
    { name: AAMA_LAYERS.INTCUT, color: 6, lt: 'DASHED' },
    { name: AAMA_LAYERS.FABRIC_CODE, color: 5, lt: 'CONTINUOUS' },
    { name: AAMA_LAYERS.ANNOTATION, color: 2, lt: 'CONTINUOUS' },
    { name: AAMA_LAYERS.FOLD_DIR, color: 6, lt: 'CONTINUOUS' },
  ];
  for (const l of layers) {
    s += `0
LAYER
5
${nextHandle()}
2
${l.name}
70
0
62
${l.color}
6
${l.lt}
`;
  }
  s += `0
ENDTAB
`;

  // BLOCK_RECORD table (R2000+)
  if (opts.version === 'R2000') {
    s += `0
TABLE
2
BLOCK_RECORD
5
${nextHandle()}
`;
    // Model space & paper space
    for (const brName of ['*MODEL_SPACE', '*PAPER_SPACE']) {
      s += `0
BLOCK_RECORD
5
${nextHandle()}
2
${brName}
`;
    }
    // One block record per piece
    for (const piece of pieces) {
      s += `0
BLOCK_RECORD
5
${nextHandle()}
2
${sanitizeBlockName(piece.name)}
`;
    }
    s += `0
ENDTAB
`;
  }

  s += `0
ENDSEC
`;
  return s;
}

// ─── Blocks ───

function dxfBlocks(pieces: PatternPiece[], opts: DXFExportOptions): string {
  // Pre-compute SA outlines via pipeline (for block content)
  const prepared = preparePieces(pieces, { spacing: 30 });

  let s = `0
SECTION
2
BLOCKS
`;

  // Model space block
  s += `0
BLOCK
5
${nextHandle()}
8
0
2
*MODEL_SPACE
70
0
10
0.0
20
0.0
0
ENDBLK
5
${nextHandle()}
8
0
`;

  // Paper space block
  s += `0
BLOCK
5
${nextHandle()}
8
0
2
*PAPER_SPACE
70
0
10
0.0
20
0.0
0
ENDBLK
5
${nextHandle()}
8
0
`;

  // One block per piece — use prepared SA outlines
  for (const pp of prepared) {
    const { piece, seamOutline } = pp;
    const blockName = sanitizeBlockName(piece.name);
    s += `0
BLOCK
5
${nextHandle()}
8
${AAMA_LAYERS.CUT}
2
${blockName}
70
0
10
0.0
20
0.0
`;
    s += pieceEntities(piece, seamOutline, opts);
    s += `0
ENDBLK
5
${nextHandle()}
8
0
`;
  }

  s += `0
ENDSEC
`;
  return s;
}

// ─── Entities Section (INSERTs) ───

function dxfEntities(pieces: PatternPiece[]): string {
  // Use pipeline for consistent layout
  const prepared = preparePieces(pieces, { spacing: 30 });

  let s = `0
SECTION
2
ENTITIES
`;

  for (const pp of prepared) {
    s += `0
INSERT
5
${nextHandle()}
8
${AAMA_LAYERS.CUT}
2
${sanitizeBlockName(pp.piece.name)}
10
${pp.offsetX.toFixed(4)}
20
${pp.offsetY.toFixed(4)}
30
0.0
41
1.0
42
1.0
50
0.0
`;
  }

  s += `0
ENDSEC
`;
  return s;
}

// ─── Piece Entities (inside block) ───

function pieceEntities(piece: PatternPiece, seamOutline: PathCommand[], opts: DXFExportOptions): string {
  let s = '';

  // Layer 8 (DRAW) = original design outline (uses SPLINE for beziers)
  s += pathToEntities(piece.outline, AAMA_LAYERS.DRAW, opts);

  // Layer 1 (CUT) = outline + seam allowance offset
  if (piece.seamAllowance > 0 && seamOutline.length > 0) {
    s += pathToEntities(seamOutline, AAMA_LAYERS.CUT, opts);
  } else {
    // No SA: CUT = DRAW
    s += pathToEntities(piece.outline, AAMA_LAYERS.CUT, opts);
  }

  // Internal lines
  for (const line of piece.internals) {
    let layer: string = AAMA_LAYERS.DRAW;
    if (line.type === 'notch') layer = AAMA_LAYERS.NOTCH;
    else if (line.type === 'grainline') layer = AAMA_LAYERS.GRAINLINE;

    if (line.path.length >= 2 && line.path[0].type === 'M' && line.path[1].type === 'L') {
      s += lineToDXF(
        line.path[0].values[0], line.path[0].values[1],
        line.path[1].values[0], line.path[1].values[1],
        layer,
      );

      // Fold direction annotation — placed at midpoint of fold line
      if (line.type === 'fold') {
        const midX = (line.path[0].values[0] + line.path[1].values[0]) / 2;
        const midY = (line.path[0].values[1] + line.path[1].values[1]) / 2;
        s += textToDXF('FOLD', midX, -(midY), 1.5, AAMA_LAYERS.FOLD_DIR);
      }
    }
  }

  // Label
  const bb = computeBBox(piece.outline);
  const cx = (bb.minX + bb.maxX) / 2;
  const cy = (bb.minY + bb.maxY) / 2;
  s += textToDXF(piece.name, cx, -(cy), 2.5, AAMA_LAYERS.DRAW);

  // Fabric code — placed 4mm below the piece name
  const fabricCode = piece.fabricId || 'MAIN';
  s += textToDXF(fabricCode, cx, -(cy + 4), 2.0, AAMA_LAYERS.FABRIC_CODE);

  return s;
}

// ─── Path → DXF entities ───

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function pathToEntities(commands: PathCommand[], layer: string, _opts: DXFExportOptions): string {
  let s = '';
  const straightPoints: { x: number; y: number }[] = [];
  let cx = 0, cy = 0;
  let isClosed = false;

  const flushStraight = () => {
    if (straightPoints.length < 2) { straightPoints.length = 0; return; }
    s += lwpolylineToDXF(straightPoints, isClosed, layer);
    straightPoints.length = 0;
  };

  for (const cmd of commands) {
    const v = cmd.values;
    switch (cmd.type) {
      case 'M':
        if (straightPoints.length > 1) flushStraight();
        cx = v[0]; cy = v[1];
        straightPoints.push({ x: cx, y: -cy });
        break;
      case 'L':
      case 'H':
      case 'V':
        if (cmd.type === 'H') { cx = v[0]; }
        else if (cmd.type === 'V') { cy = v[0]; }
        else { cx = v[0]; cy = v[1]; }
        straightPoints.push({ x: cx, y: -cy });
        break;
      case 'C': {
        flushStraight();
        const p0x = cx, p0y = cy;
        const cp1x = v[0], cp1y = v[1];
        const cp2x = v[2], cp2y = v[3];
        const p1x = v[4], p1y = v[5];

        s += splineToDXF([
          { x: p0x, y: -p0y },
          { x: cp1x, y: -cp1y },
          { x: cp2x, y: -cp2y },
          { x: p1x, y: -p1y },
        ], layer);

        cx = p1x; cy = p1y;
        straightPoints.push({ x: cx, y: -cy });
        break;
      }
      case 'Q': {
        flushStraight();
        const qp0x = cx, qp0y = cy;
        const qcx = v[0], qcy = v[1];
        const qp1x = v[2], qp1y = v[3];
        const c1x = qp0x + (2 / 3) * (qcx - qp0x);
        const c1y = qp0y + (2 / 3) * (qcy - qp0y);
        const c2x = qp1x + (2 / 3) * (qcx - qp1x);
        const c2y = qp1y + (2 / 3) * (qcy - qp1y);

        s += splineToDXF([
          { x: qp0x, y: -qp0y },
          { x: c1x, y: -c1y },
          { x: c2x, y: -c2y },
          { x: qp1x, y: -qp1y },
        ], layer);

        cx = qp1x; cy = qp1y;
        straightPoints.push({ x: cx, y: -cy });
        break;
      }
      case 'Z':
        isClosed = true;
        break;
    }
  }
  flushStraight();
  return s;
}

// ─── DXF Entity Generators ───

function splineToDXF(controlPoints: { x: number; y: number }[], layer: string): string {
  const n = controlPoints.length;
  const numSegments = Math.floor((n - 1) / 3);
  const knots: number[] = [0, 0, 0, 0];
  for (let i = 1; i < numSegments; i++) {
    knots.push(i, i, i);
  }
  knots.push(numSegments, numSegments, numSegments, numSegments);

  const knotVec = numSegments <= 1 ? [0, 0, 0, 0, 1, 1, 1, 1] : knots;

  let s = `0
SPLINE
5
${nextHandle()}
8
${layer}
70
8
71
3
72
${knotVec.length}
73
${n}
`;
  for (const k of knotVec) {
    s += `40
${k.toFixed(6)}
`;
  }
  for (const pt of controlPoints) {
    s += `10
${pt.x.toFixed(4)}
20
${pt.y.toFixed(4)}
30
0.0
`;
  }
  return s;
}

function lwpolylineToDXF(points: { x: number; y: number }[], closed: boolean, layer: string): string {
  let s = `0
LWPOLYLINE
5
${nextHandle()}
8
${layer}
90
${points.length}
70
${closed ? 1 : 0}
`;
  for (const pt of points) {
    s += `10
${pt.x.toFixed(4)}
20
${pt.y.toFixed(4)}
`;
  }
  return s;
}

function lineToDXF(x1: number, y1: number, x2: number, y2: number, layer: string): string {
  return `0
LINE
5
${nextHandle()}
8
${layer}
10
${x1.toFixed(4)}
20
${(-y1).toFixed(4)}
11
${x2.toFixed(4)}
21
${(-y2).toFixed(4)}
`;
}

function textToDXF(text: string, x: number, y: number, height: number, layer: string): string {
  return `0
TEXT
5
${nextHandle()}
8
${layer}
10
${x.toFixed(4)}
20
${y.toFixed(4)}
40
${height.toFixed(1)}
1
${escapeDxfString(text)}
`;
}

// ─── Helpers ───

function sanitizeBlockName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 31);
}

/** Gap between size groups on Y axis (mm) */
const SIZE_GAP = 100;

// ─── Multi-Size Types ───

/** A set of pattern pieces for a single graded size. */
export interface GradedSizeSet {
  size: string;
  pieces: PatternPiece[];
}

// ─── Multi-Size Helpers ───

/**
 * Build a size-qualified block name: `<PIECE_NAME>_<SIZE>`.
 * Sanitized and truncated to 31 chars per DXF spec.
 */
function sizeBlockName(pieceName: string, size: string): string {
  return sanitizeBlockName(`${pieceName}_${size}`);
}

/**
 * Collect all size-qualified block names across every graded set.
 */
function collectMultiSizeBlockNames(gradedSets: GradedSizeSet[]): string[] {
  const names: string[] = [];
  for (const gs of gradedSets) {
    for (const piece of gs.pieces) {
      names.push(sizeBlockName(piece.name, gs.size));
    }
  }
  return names;
}

/**
 * TABLES section for multi-size DXF.
 * Creates BLOCK_RECORD entries for every `<PIECE>_<SIZE>` block.
 */
function dxfTablesMultiSize(blockNames: string[], opts: DXFExportOptions): string {
  let s = `0
SECTION
2
TABLES
`;
  // LAYER table (identical to single-size)
  s += `0
TABLE
2
LAYER
5
${nextHandle()}
`;
  const layers = [
    { name: AAMA_LAYERS.CUT, color: 7, lt: 'CONTINUOUS' },
    { name: AAMA_LAYERS.NOTCH, color: 1, lt: 'CONTINUOUS' },
    { name: AAMA_LAYERS.GRAINLINE, color: 3, lt: 'CONTINUOUS' },
    { name: AAMA_LAYERS.DRAW, color: 4, lt: 'CONTINUOUS' },
    { name: AAMA_LAYERS.INTCUT, color: 6, lt: 'DASHED' },
    { name: AAMA_LAYERS.FABRIC_CODE, color: 5, lt: 'CONTINUOUS' },
    { name: AAMA_LAYERS.ANNOTATION, color: 2, lt: 'CONTINUOUS' },
    { name: AAMA_LAYERS.FOLD_DIR, color: 6, lt: 'CONTINUOUS' },
  ];
  for (const l of layers) {
    s += `0
LAYER
5
${nextHandle()}
2
${l.name}
70
0
62
${l.color}
6
${l.lt}
`;
  }
  s += `0
ENDTAB
`;

  // BLOCK_RECORD table (R2000+)
  if (opts.version === 'R2000') {
    s += `0
TABLE
2
BLOCK_RECORD
5
${nextHandle()}
`;
    for (const brName of ['*MODEL_SPACE', '*PAPER_SPACE']) {
      s += `0
BLOCK_RECORD
5
${nextHandle()}
2
${brName}
`;
    }
    for (const bn of blockNames) {
      s += `0
BLOCK_RECORD
5
${nextHandle()}
2
${bn}
`;
    }
    s += `0
ENDTAB
`;
  }

  s += `0
ENDSEC
`;
  return s;
}

/**
 * BLOCKS section for multi-size DXF.
 * Creates one block per piece per size, reusing `pieceEntities()`.
 */
function dxfBlocksMultiSize(gradedSets: GradedSizeSet[], opts: DXFExportOptions): string {
  let s = `0
SECTION
2
BLOCKS
`;

  // Model space block
  s += `0
BLOCK
5
${nextHandle()}
8
0
2
*MODEL_SPACE
70
0
10
0.0
20
0.0
0
ENDBLK
5
${nextHandle()}
8
0
`;

  // Paper space block
  s += `0
BLOCK
5
${nextHandle()}
8
0
2
*PAPER_SPACE
70
0
10
0.0
20
0.0
0
ENDBLK
5
${nextHandle()}
8
0
`;

  // One block per piece per size
  for (const gs of gradedSets) {
    const prepared = preparePieces(gs.pieces, { spacing: 30 });
    for (const pp of prepared) {
      const blockName = sizeBlockName(pp.piece.name, gs.size);
      s += `0
BLOCK
5
${nextHandle()}
8
${AAMA_LAYERS.CUT}
2
${blockName}
70
0
10
0.0
20
0.0
`;
      s += pieceEntities(pp.piece, pp.seamOutline, opts);
      s += `0
ENDBLK
5
${nextHandle()}
8
0
`;
    }
  }

  s += `0
ENDSEC
`;
  return s;
}

/**
 * ENTITIES section for multi-size DXF.
 * Each size group is offset on the Y axis by SIZE_GAP plus the max height
 * of the previous group, so sizes don't overlap.
 */
function dxfEntitiesMultiSize(gradedSets: GradedSizeSet[]): string {
  let s = `0
SECTION
2
ENTITIES
`;

  let currentY = 0;

  for (const gs of gradedSets) {
    const prepared = preparePieces(gs.pieces, { spacing: 30 });

    let maxHeight = 0;
    for (const pp of prepared) {
      const h = pp.boundingBox.height;
      if (h > maxHeight) maxHeight = h;
    }

    for (const pp of prepared) {
      s += `0
INSERT
5
${nextHandle()}
8
${AAMA_LAYERS.CUT}
2
${sizeBlockName(pp.piece.name, gs.size)}
10
${pp.offsetX.toFixed(4)}
20
${(pp.offsetY - currentY).toFixed(4)}
30
0.0
41
1.0
42
1.0
50
0.0
`;
    }

    currentY += maxHeight + SIZE_GAP;
  }

  s += `0
ENDSEC
`;
  return s;
}

// ─── Public API ───

/**
 * Generate an AAMA/ASTM D6673 compliant DXF string from pattern pieces.
 *
 * Produces a complete DXF with HEADER, TABLES (layers + block records),
 * BLOCKS (one per piece with outline, internals, and label), and ENTITIES
 * (INSERT references spaced horizontally).
 *
 * Uses the shared export pipeline for piece preparation (bbox, SA, layout).
 *
 * @param pieces - Pattern pieces to export
 * @param options - Optional export settings (DXF version, AAMA layer toggle)
 * @returns Complete DXF file content as a string
 */
export function generateDXFAAMA(pieces: PatternPiece[], options?: Partial<DXFExportOptions>): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  resetHandles();

  let dxf = '';
  dxf += dxfHeader();
  dxf += dxfTables(pieces, opts);
  dxf += dxfBlocks(pieces, opts);
  dxf += dxfEntities(pieces);
  dxf += `0
EOF
`;
  return dxf;
}

/**
 * Generate an AAMA DXF and trigger a browser file download.
 *
 * @param pieces - Pattern pieces to export
 * @param filename - Download filename (default: `'pattern-aama.dxf'`)
 * @param options - Optional DXF export settings
 */
export function downloadDXFAAMA(pieces: PatternPiece[], filename = 'pattern-aama.dxf', options?: Partial<DXFExportOptions>) {
  const dxf = generateDXFAAMA(pieces, options);
  const blob = new Blob([dxf], { type: 'application/dxf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Multi-Size Public API ───

/**
 * Generate an AAMA/ASTM D6673 compliant DXF containing multiple graded sizes.
 *
 * Each piece in each size becomes a separate BLOCK named `<PIECE_NAME>_<SIZE>`.
 * Size groups are offset vertically by SIZE_GAP (100 mm) so they don't overlap
 * in the ENTITIES section. Reuses all single-size infrastructure (SA, layers,
 * entity generators) via the shared export pipeline.
 *
 * @param gradedSets - Array of { size, pieces } objects, one per graded size
 * @param options - Optional DXF export settings
 * @returns Complete DXF file content as a string
 */
export function generateMultiSizeDXF(gradedSets: GradedSizeSet[], options?: Partial<DXFExportOptions>): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  resetHandles();

  const blockNames = collectMultiSizeBlockNames(gradedSets);

  let dxf = '';
  dxf += dxfHeader();
  dxf += dxfTablesMultiSize(blockNames, opts);
  dxf += dxfBlocksMultiSize(gradedSets, opts);
  dxf += dxfEntitiesMultiSize(gradedSets);
  dxf += `0
EOF
`;
  return dxf;
}

/**
 * Generate a multi-size AAMA DXF and trigger a browser file download.
 *
 * @param gradedSets - Array of { size, pieces } objects
 * @param filename - Download filename (default: `'pattern-multisize.dxf'`)
 * @param options - Optional DXF export settings
 */
export function downloadMultiSizeDXF(gradedSets: GradedSizeSet[], filename = 'pattern-multisize.dxf', options?: Partial<DXFExportOptions>) {
  const dxf = generateMultiSizeDXF(gradedSets, options);
  const blob = new Blob([dxf], { type: 'application/dxf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
