import { PatternPiece, PathCommand } from '../types/types';
import { preparePieces } from './export/pipeline';
import { escapeDxfString } from './sanitizeName';

/**
 * Export pattern pieces to DXF (AutoCAD Drawing Exchange Format).
 * 
 * Layers:
 *   CUT — piece outlines (main cut lines)
 *   SEAM — seam allowance lines (dashed)
 *   NOTCH — notch marks
 *   GRAINLINE — grain direction arrows
 *   LABEL — piece names
 *   FABRIC_CODE — fabric code annotations
 *
 * Units: millimeters (1 SVG unit = 1mm)
 * DXF version: R12 (maximum compatibility with plotters)
 */

export interface DxfExportOptions {
  /**
   * Maximum allowed chord error in mm for curve flattening.
   * Lower = more precise (more vertices), higher = fewer vertices.
   * Default: 0.1mm (suitable for laser cutters and plotters).
   */
  curveTolerance?: number;
  /**
   * Minimum segments per curve (floor). Default: 4.
   */
  minSegments?: number;
  /**
   * Maximum segments per curve (ceiling). Default: 64.
   */
  maxSegments?: number;
}

const DEFAULT_CURVE_TOLERANCE = 0.1; // mm
const DEFAULT_MIN_SEGMENTS = 4;
const DEFAULT_MAX_SEGMENTS = 64;

/**
 * Adaptively flatten a cubic bezier based on chord error tolerance.
 * Uses recursive subdivision until the midpoint deviation from the
 * chord is within tolerance.
 */
function flattenCubicBezier(
  x0: number, y0: number,
  x1: number, y1: number,
  x2: number, y2: number,
  x3: number, y3: number,
  tolerance: number,
  minSegs: number,
  maxSegs: number,
): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];

  function subdivide(
    ax0: number, ay0: number,
    ax1: number, ay1: number,
    ax2: number, ay2: number,
    ax3: number, ay3: number,
    depth: number,
  ) {
    const dx = ax3 - ax0;
    const dy = ay3 - ay0;
    const lenSq = dx * dx + dy * dy;

    let d1: number, d2: number;
    if (lenSq < 1e-10) {
      d1 = Math.sqrt((ax1 - ax0) ** 2 + (ay1 - ay0) ** 2);
      d2 = Math.sqrt((ax2 - ax0) ** 2 + (ay2 - ay0) ** 2);
    } else {
      d1 = Math.abs((ax1 - ax0) * dy - (ay1 - ay0) * dx) / Math.sqrt(lenSq);
      d2 = Math.abs((ax2 - ax0) * dy - (ay2 - ay0) * dx) / Math.sqrt(lenSq);
    }

    const maxD = Math.max(d1, d2);

    if (maxD <= tolerance && depth >= Math.log2(minSegs)) {
      points.push({ x: ax3, y: ay3 });
    } else if (depth >= Math.log2(maxSegs)) {
      points.push({ x: ax3, y: ay3 });
    } else {
      const mx01 = (ax0 + ax1) / 2, my01 = (ay0 + ay1) / 2;
      const mx12 = (ax1 + ax2) / 2, my12 = (ay1 + ay2) / 2;
      const mx23 = (ax2 + ax3) / 2, my23 = (ay2 + ay3) / 2;
      const mx012 = (mx01 + mx12) / 2, my012 = (my01 + my12) / 2;
      const mx123 = (mx12 + mx23) / 2, my123 = (my12 + my23) / 2;
      const mx0123 = (mx012 + mx123) / 2, my0123 = (my012 + my123) / 2;

      subdivide(ax0, ay0, mx01, my01, mx012, my012, mx0123, my0123, depth + 1);
      subdivide(mx0123, my0123, mx123, my123, mx23, my23, ax3, ay3, depth + 1);
    }
  }

  subdivide(x0, y0, x1, y1, x2, y2, x3, y3, 0);
  return points;
}

/**
 * Adaptively flatten a quadratic bezier based on chord error tolerance.
 */
function flattenQuadBezier(
  x0: number, y0: number,
  x1: number, y1: number,
  x2: number, y2: number,
  tolerance: number,
  minSegs: number,
  maxSegs: number,
): { x: number; y: number }[] {
  const cx1 = x0 + (2 / 3) * (x1 - x0);
  const cy1 = y0 + (2 / 3) * (y1 - y0);
  const cx2 = x2 + (2 / 3) * (x1 - x2);
  const cy2 = y2 + (2 / 3) * (y1 - y2);
  return flattenCubicBezier(x0, y0, cx1, cy1, cx2, cy2, x2, y2, tolerance, minSegs, maxSegs);
}


function dxfHeader(): string {
  return `0
SECTION
2
HEADER
9
$INSUNITS
70
4
9
$MEASUREMENT
70
1
0
ENDSEC
0
SECTION
2
TABLES
0
TABLE
2
LAYER
0
LAYER
2
CUT
70
0
62
7
6
CONTINUOUS
0
LAYER
2
SEAM
70
0
62
8
6
DASHED
0
LAYER
2
NOTCH
70
0
62
1
6
CONTINUOUS
0
LAYER
2
GRAINLINE
70
0
62
3
6
CONTINUOUS
0
LAYER
2
LABEL
70
0
62
5
6
CONTINUOUS
0
LAYER
2
FABRIC_CODE
70
0
62
6
6
CONTINUOUS
0
ENDTAB
0
ENDSEC
0
SECTION
2
ENTITIES
`;
}

function dxfFooter(): string {
  return `0
ENDSEC
0
EOF
`;
}

/** Convert PathCommands to DXF LWPOLYLINE entities */
function outlineToDXF(
  commands: PathCommand[],
  offsetX: number,
  offsetY: number,
  layer: string,
  opts: DxfExportOptions = {},
): string {
  const tolerance = opts.curveTolerance ?? DEFAULT_CURVE_TOLERANCE;
  const minSegs = opts.minSegments ?? DEFAULT_MIN_SEGMENTS;
  const maxSegs = opts.maxSegments ?? DEFAULT_MAX_SEGMENTS;
  const points: { x: number; y: number; bulge: number }[] = [];
  let cx = 0, cy = 0;
  let isClosed = false;

  for (const cmd of commands) {
    const v = cmd.values;
    switch (cmd.type) {
      case 'M':
        cx = v[0]; cy = v[1];
        points.push({ x: cx + offsetX, y: -(cy + offsetY), bulge: 0 });
        break;
      case 'L':
        cx = v[0]; cy = v[1];
        points.push({ x: cx + offsetX, y: -(cy + offsetY), bulge: 0 });
        break;
      case 'C': {
        const flatPts = flattenCubicBezier(
          cx, cy, v[0], v[1], v[2], v[3], v[4], v[5],
          tolerance, minSegs, maxSegs,
        );
        for (const pt of flatPts) {
          points.push({ x: pt.x + offsetX, y: -(pt.y + offsetY), bulge: 0 });
        }
        cx = v[4]; cy = v[5];
        break;
      }
      case 'Q': {
        const flatPts = flattenQuadBezier(
          cx, cy, v[0], v[1], v[2], v[3],
          tolerance, minSegs, maxSegs,
        );
        for (const pt of flatPts) {
          points.push({ x: pt.x + offsetX, y: -(pt.y + offsetY), bulge: 0 });
        }
        cx = v[2]; cy = v[3];
        break;
      }
      case 'Z':
        isClosed = true;
        break;
    }
  }

  if (points.length < 2) return '';

  let dxf = `0
LWPOLYLINE
8
${layer}
90
${points.length}
70
${isClosed ? 1 : 0}
`;
  for (const pt of points) {
    dxf += `10
${pt.x.toFixed(4)}
20
${pt.y.toFixed(4)}
42
${pt.bulge.toFixed(4)}
`;
  }

  return dxf;
}

/** Create a DXF LINE entity */
function lineToDXF(
  x1: number, y1: number, x2: number, y2: number,
  offsetX: number, offsetY: number,
  layer: string,
): string {
  return `0
LINE
8
${layer}
10
${(x1 + offsetX).toFixed(4)}
20
${(-(y1 + offsetY)).toFixed(4)}
11
${(x2 + offsetX).toFixed(4)}
21
${(-(y2 + offsetY)).toFixed(4)}
`;
}

/** Create a DXF TEXT entity */
function textToDXF(
  text: string,
  x: number, y: number,
  offsetX: number, offsetY: number,
  height: number,
  layer: string,
): string {
  return `0
TEXT
8
${layer}
10
${(x + offsetX).toFixed(4)}
20
${(-(y + offsetY)).toFixed(4)}
40
${height.toFixed(1)}
1
${escapeDxfString(text)}
72
1
11
${(x + offsetX).toFixed(4)}
21
${(-(y + offsetY)).toFixed(4)}
`;
}

/**
 * Generate a DXF string from pattern pieces.
 * Uses shared pipeline for piece preparation (bbox, SA, layout).
 */
/** @deprecated Use generateDXFAAMA from utils/dxf for AAMA compliance. */
export function generateDXFLegacy(pieces: PatternPiece[], opts: DxfExportOptions = {}): string {
  const prepared = preparePieces(pieces, { spacing: 30 });

  let dxf = dxfHeader();

  for (const pp of prepared) {
    const { piece, seamOutline, offsetX, offsetY, boundingBox: bb } = pp;

    // Outline (cut line)
    dxf += outlineToDXF(piece.outline, offsetX, offsetY, 'CUT', opts);

    // Seam allowance — proper offset via Clipper2 (from pipeline)
    if (piece.seamAllowance > 0 && seamOutline.length > 0) {
      dxf += outlineToDXF(seamOutline, offsetX, offsetY, 'SEAM', opts);
    }

    // Internal lines
    for (const line of piece.internals) {
      const cmds = line.path;
      if (cmds.length >= 2) {
        const layer = line.type === 'notch' ? 'NOTCH' :
                      line.type === 'grainline' ? 'GRAINLINE' : 'CUT';
        
        if (cmds[0].type === 'M' && cmds[1].type === 'L') {
          dxf += lineToDXF(
            cmds[0].values[0], cmds[0].values[1],
            cmds[1].values[0], cmds[1].values[1],
            offsetX, offsetY, layer,
          );
        }
      }
    }

    // Label
    const centerX = (bb.minX + bb.maxX) / 2;
    const centerY = (bb.minY + bb.maxY) / 2;
    dxf += textToDXF(piece.name, centerX, centerY, offsetX, offsetY, 5, 'LABEL');
    dxf += textToDXF(piece.fabricCode || 'SELF', centerX, centerY + 5, offsetX, offsetY, 5, 'FABRIC_CODE');
  }

  dxf += dxfFooter();
  return dxf;
}

/** Keep generateDXF as alias for backward compat */
export const generateDXF = generateDXFLegacy;

/** @deprecated Use downloadDXFAAMA from utils/dxf for AAMA compliance. */
export function downloadDXF(pieces: PatternPiece[], filename = 'pattern.dxf', opts: DxfExportOptions = {}) {
  const dxf = generateDXFLegacy(pieces, opts);
  const blob = new Blob([dxf], { type: 'application/dxf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
