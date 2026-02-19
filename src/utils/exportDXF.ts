import { PatternPiece, PathCommand } from '../types/types';

/**
 * Export pattern pieces to DXF (AutoCAD Drawing Exchange Format).
 * 
 * Layers:
 *   CUT — piece outlines (main cut lines)
 *   SEAM — seam allowance lines (dashed)
 *   NOTCH — notch marks
 *   GRAINLINE — grain direction arrows
 *   LABEL — piece names
 * 
 * Units: millimeters (1 SVG unit = 1mm)
 * DXF version: R12 (maximum compatibility with plotters)
 */


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

/** Convert PathCommands to DXF POLYLINE/LWPOLYLINE entities */
function outlineToDXF(
  commands: PathCommand[],
  offsetX: number,
  offsetY: number,
  layer: string,
): string {
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
        // Approximate cubic bezier with line segments
        const x0 = cx, y0 = cy;
        const x1 = v[0], y1 = v[1];
        const x2 = v[2], y2 = v[3];
        const x3 = v[4], y3 = v[5];
        const steps = 12;
        for (let s = 1; s <= steps; s++) {
          const t = s / steps;
          const mt = 1 - t;
          const px = mt*mt*mt*x0 + 3*mt*mt*t*x1 + 3*mt*t*t*x2 + t*t*t*x3;
          const py = mt*mt*mt*y0 + 3*mt*mt*t*y1 + 3*mt*t*t*y2 + t*t*t*y3;
          points.push({ x: px + offsetX, y: -(py + offsetY), bulge: 0 });
        }
        cx = x3; cy = y3;
        break;
      }
      case 'Q': {
        const x0 = cx, y0 = cy;
        const x1 = v[0], y1 = v[1];
        const x2 = v[2], y2 = v[3];
        const steps = 8;
        for (let s = 1; s <= steps; s++) {
          const t = s / steps;
          const mt = 1 - t;
          const px = mt*mt*x0 + 2*mt*t*x1 + t*t*x2;
          const py = mt*mt*y0 + 2*mt*t*y1 + t*t*y2;
          points.push({ x: px + offsetX, y: -(py + offsetY), bulge: 0 });
        }
        cx = x2; cy = y2;
        break;
      }
      case 'Z':
        isClosed = true;
        break;
    }
  }

  if (points.length < 2) return '';

  // LWPOLYLINE (lightweight, better compatibility)
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
${text}
72
1
11
${(x + offsetX).toFixed(4)}
21
${(-(y + offsetY)).toFixed(4)}
`;
}

/** Compute bounding box of a piece */
function pieceBBox(piece: PatternPiece): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const cmd of piece.outline) {
    const v = cmd.values;
    for (let i = 0; i < v.length - 1; i += 2) {
      minX = Math.min(minX, v[i]);
      minY = Math.min(minY, v[i + 1]);
      maxX = Math.max(maxX, v[i]);
      maxY = Math.max(maxY, v[i + 1]);
    }
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Generate a DXF string from pattern pieces.
 * Pieces are laid out left-to-right with spacing.
 */
export function generateDXF(pieces: PatternPiece[]): string {
  let dxf = dxfHeader();
  const SPACING = 30; // mm between pieces
  let currentX = 0;

  for (const piece of pieces) {
    const bb = pieceBBox(piece);
    const offsetX = currentX - bb.minX;
    const offsetY = -bb.minY;

    // Outline (cut line)
    dxf += outlineToDXF(piece.outline, offsetX, offsetY, 'CUT');

    // Seam allowance (offset outline — simplified: same shape for now)
    // TODO: proper offset curve
    if (piece.seamAllowance > 0) {
      dxf += outlineToDXF(piece.outline, offsetX, offsetY, 'SEAM');
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

    currentX += (bb.maxX - bb.minX) + SPACING;
  }

  dxf += dxfFooter();
  return dxf;
}

/** Download DXF as file */
export function downloadDXF(pieces: PatternPiece[], filename = 'pattern.dxf') {
  const dxf = generateDXF(pieces);
  const blob = new Blob([dxf], { type: 'application/dxf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
