import { PatternPiece, PathCommand } from '../types/types';

/**
 * Export pattern pieces to PDF at 1:1 scale.
 * Pure JS — no external PDF library needed.
 * Uses PDF drawing operators directly.
 * 
 * Features:
 *   - 1:1 scale (1mm = 1 PDF unit at 72dpi → 2.8346pt)
 *   - Cut lines (solid black)
 *   - Seam allowance (dashed gray)
 *   - Notch marks (red)
 *   - Grainline arrows (green)
 *   - Piece labels
 *   - A0 page size (841 x 1189 mm) for plotter output
 */

const MM_TO_PT = 72 / 25.4; // 2.8346 pt per mm

function pieceBBox(piece: PatternPiece) {
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
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

/** Convert PathCommands to PDF path operators */
function commandsToPDFPath(
  commands: PathCommand[],
  ox: number,
  oy: number,
  pageH: number,
): string {
  let path = '';
  let cx = 0, cy = 0;

  const tx = (x: number) => ((x + ox) * MM_TO_PT).toFixed(2);
  const ty = (y: number) => ((pageH - (y + oy)) * MM_TO_PT).toFixed(2);

  for (const cmd of commands) {
    const v = cmd.values;
    switch (cmd.type) {
      case 'M':
        path += `${tx(v[0])} ${ty(v[1])} m\n`;
        cx = v[0]; cy = v[1];
        break;
      case 'L':
        path += `${tx(v[0])} ${ty(v[1])} l\n`;
        cx = v[0]; cy = v[1];
        break;
      case 'C':
        path += `${tx(v[0])} ${ty(v[1])} ${tx(v[2])} ${ty(v[3])} ${tx(v[4])} ${ty(v[5])} c\n`;
        cx = v[4]; cy = v[5];
        break;
      case 'Q': {
        // Convert quadratic to cubic
        const qx0 = cx, qy0 = cy;
        const qx1 = v[0], qy1 = v[1];
        const qx2 = v[2], qy2 = v[3];
        const cp1x = qx0 + 2/3 * (qx1 - qx0);
        const cp1y = qy0 + 2/3 * (qy1 - qy0);
        const cp2x = qx2 + 2/3 * (qx1 - qx2);
        const cp2y = qy2 + 2/3 * (qy1 - qy2);
        path += `${tx(cp1x)} ${ty(cp1y)} ${tx(cp2x)} ${ty(cp2y)} ${tx(qx2)} ${ty(qy2)} c\n`;
        cx = qx2; cy = qy2;
        break;
      }
      case 'Z':
        path += 'h\n';
        break;
    }
  }
  return path;
}

/**
 * Generate PDF content.
 * Returns raw PDF bytes as a string (ASCII + binary-safe via Blob).
 */
export function generatePDF(pieces: PatternPiece[]): string {
  // Calculate total layout: pieces side by side
  const SPACING = 30; // mm
  const MARGIN = 20; // mm
  let totalW = MARGIN * 2;
  let maxH = 0;
  const layouts: { piece: PatternPiece; ox: number; oy: number }[] = [];
  let cx = MARGIN;

  for (const piece of pieces) {
    const bb = pieceBBox(piece);
    layouts.push({
      piece,
      ox: cx - bb.minX,
      oy: MARGIN - bb.minY,
    });
    cx += bb.w + SPACING;
    maxH = Math.max(maxH, bb.h);
  }
  totalW = cx - SPACING + MARGIN;
  const totalH = maxH + MARGIN * 2;

  // Page size in points
  const pageW = totalW * MM_TO_PT;
  const pageH = totalH * MM_TO_PT;

  // Build PDF content stream
  let stream = '';

  for (const { piece, ox, oy } of layouts) {
    const bb = pieceBBox(piece);

    // Cut line — solid black 0.5pt
    stream += '0 0 0 RG\n0.5 w\n[] 0 d\n';
    stream += commandsToPDFPath(piece.outline, ox, oy, totalH);
    stream += 'S\n';

    // Seam allowance — dashed gray (same outline for now)
    if (piece.seamAllowance > 0) {
      stream += '0.6 0.6 0.6 RG\n0.3 w\n[3 2] 0 d\n';
      stream += commandsToPDFPath(piece.outline, ox, oy, totalH);
      stream += 'S\n';
    }

    // Internals
    for (const line of piece.internals) {
      const cmds = line.path;
      if (cmds.length < 2) continue;

      if (line.type === 'notch') {
        stream += '1 0 0 RG\n0.4 w\n[] 0 d\n'; // red
      } else if (line.type === 'grainline') {
        stream += '0 0.6 0 RG\n0.4 w\n[] 0 d\n'; // green
      } else {
        stream += '0 0 0 RG\n0.3 w\n[] 0 d\n';
      }

      if (cmds[0].type === 'M' && cmds[1].type === 'L') {
        const x1 = (cmds[0].values[0] + ox) * MM_TO_PT;
        const y1 = (totalH - (cmds[0].values[1] + oy)) * MM_TO_PT;
        const x2 = (cmds[1].values[0] + ox) * MM_TO_PT;
        const y2 = (totalH - (cmds[1].values[1] + oy)) * MM_TO_PT;
        stream += `${x1.toFixed(2)} ${y1.toFixed(2)} m\n`;
        stream += `${x2.toFixed(2)} ${y2.toFixed(2)} l\nS\n`;

        // Arrow for grainline
        if (line.type === 'grainline') {
          const dx = x2 - x1, dy = y2 - y1;
          const len = Math.hypot(dx, dy);
          if (len > 0) {
            const ux = dx/len, uy = dy/len;
            const as = 4 * MM_TO_PT; // arrow size
            stream += `${x2.toFixed(2)} ${y2.toFixed(2)} m\n`;
            stream += `${(x2 - ux*as + uy*as*0.4).toFixed(2)} ${(y2 - uy*as - ux*as*0.4).toFixed(2)} l\n`;
            stream += `${(x2 - ux*as - uy*as*0.4).toFixed(2)} ${(y2 - uy*as + ux*as*0.4).toFixed(2)} l\nf\n`;
          }
        }
      }
    }

    // Label
    const labelX = ((bb.minX + bb.maxX) / 2 + ox) * MM_TO_PT;
    const labelY = (totalH - ((bb.minY + bb.maxY) / 2 + oy)) * MM_TO_PT;
    stream += '0 0 0 RG\n';
    stream += `BT /F1 ${(3 * MM_TO_PT).toFixed(1)} Tf ${labelX.toFixed(2)} ${labelY.toFixed(2)} Td (${piece.name}) Tj ET\n`;
  }

  // Build minimal PDF
  const objects: string[] = [];
  let objCount = 0;

  const addObj = (content: string) => {
    objCount++;
    objects.push(`${objCount} 0 obj\n${content}\nendobj\n`);
    return objCount;
  };

  // 1: Catalog
  addObj('<< /Type /Catalog /Pages 2 0 R >>');
  // 2: Pages
  addObj(`<< /Type /Pages /Kids [3 0 R] /Count 1 >>`);
  // 3: Page
  addObj(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW.toFixed(2)} ${pageH.toFixed(2)}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>`);
  // 4: Content stream
  const streamBytes = new TextEncoder().encode(stream);
  addObj(`<< /Length ${streamBytes.length} >>\nstream\n${stream}endstream`);
  // 5: Font
  addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  // Build PDF
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += obj;
  }

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objCount + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    pdf += `${off.toString().padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return pdf;
}

/** Download PDF as file */
export function downloadPDF(pieces: PatternPiece[], filename = 'pattern.pdf') {
  const pdf = generatePDF(pieces);
  const blob = new Blob([pdf], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
