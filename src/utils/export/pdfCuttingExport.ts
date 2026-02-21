/**
 * PDF Cutting Layout Export — renders LayoutResult to a production-ready PDF.
 *
 * Uses raw PDF operators (same approach as exportPDF.ts) — no external dependencies.
 * Supports A0/A1/A4 sheets, seam allowance dashed lines, grainline arrows,
 * notch marks, piece labels, title blocks, and A4 tiled alignment marks.
 */

import type { LayoutResult, LayoutPage, PlacedPiece, CuttingLayoutConfig } from './cuttingLayout';

const MM_TO_PT = 72 / 25.4;

// ─── PDF Helpers ───

function tx(x: number): string {
  return (x * MM_TO_PT).toFixed(2);
}

function ty(y: number, pageH: number): string {
  return ((pageH - y) * MM_TO_PT).toFixed(2);
}

function drawPolyline(coords: number[], pageH: number, close = false): string {
  if (coords.length < 4) return '';
  let path = `${tx(coords[0])} ${ty(coords[1], pageH)} m\n`;
  for (let i = 2; i < coords.length; i += 2) {
    path += `${tx(coords[i])} ${ty(coords[i + 1], pageH)} l\n`;
  }
  if (close) path += 'h\n';
  return path;
}

function drawAlignmentMarks(pageW: number, pageH: number, tileRow?: number, tileCol?: number): string {
  if (tileRow === undefined || tileCol === undefined) return '';
  let stream = '0.3 0.3 0.3 RG\n0.3 w\n[] 0 d\n';
  const markLen = 5; // mm

  // Corner marks (cross-hairs)
  const corners = [
    [0, 0], [pageW, 0], [0, pageH], [pageW, pageH],
  ];
  for (const [cx, cy] of corners) {
    // Horizontal line
    const x1 = Math.max(0, cx - markLen);
    const x2 = Math.min(pageW, cx + markLen);
    stream += `${tx(x1)} ${ty(cy, pageH)} m\n${tx(x2)} ${ty(cy, pageH)} l\nS\n`;
    // Vertical line
    const y1 = Math.max(0, cy - markLen);
    const y2 = Math.min(pageH, cy + markLen);
    stream += `${tx(cx)} ${ty(y1, pageH)} m\n${tx(cx)} ${ty(y2, pageH)} l\nS\n`;
  }

  return stream;
}

function renderTitleBlock(
  _pageW: number,
  pageH: number,
  config: CuttingLayoutConfig,
  layout: LayoutResult,
): string {
  let stream = '';
  const bx = 10, by = 10, bw = 120, bh = 35;

  // Box
  stream += '0 0 0 RG\n0.3 w\n[] 0 d\n';
  stream += `${tx(bx)} ${ty(by, pageH)} ${tx(bw)} ${tx(-bh)} re S\n`;

  // Text
  const fontSize = 2.5 * MM_TO_PT;
  const smallFont = 2 * MM_TO_PT;
  stream += `0 0 0 RG\n`;

  stream += `BT /F1 ${fontSize.toFixed(1)} Tf ${tx(bx + 3)} ${ty(by + 6, pageH)} Td (Cutting Layout) Tj ET\n`;

  const scaleText = config.scale === 1 ? '1:1' : `1:${Math.round(1 / config.scale)}`;
  stream += `BT /F1 ${smallFont.toFixed(1)} Tf ${tx(bx + 3)} ${ty(by + 12, pageH)} Td (Scale: ${scaleText}) Tj ET\n`;

  const utilPct = (layout.fabricUtilization * 100).toFixed(1);
  stream += `BT /F1 ${smallFont.toFixed(1)} Tf ${tx(bx + 3)} ${ty(by + 18, pageH)} Td (Utilization: ${utilPct}%) Tj ET\n`;

  stream += `BT /F1 ${smallFont.toFixed(1)} Tf ${tx(bx + 3)} ${ty(by + 24, pageH)} Td (Paper: ${config.paperSize}) Tj ET\n`;

  const date = new Date().toISOString().slice(0, 10);
  stream += `BT /F1 ${smallFont.toFixed(1)} Tf ${tx(bx + 3)} ${ty(by + 30, pageH)} Td (Date: ${date}) Tj ET\n`;

  return stream;
}

function renderPiece(piece: PlacedPiece, pageH: number, config: CuttingLayoutConfig): string {
  let stream = '';

  // Outline — solid black
  stream += '0 0 0 RG\n0.5 w\n[] 0 d\n';
  stream += drawPolyline(piece.outline, pageH, true);
  stream += 'S\n';

  // Seam allowance — dashed gray
  if (piece.seamAllowance && piece.seamAllowance.length >= 4) {
    stream += '0.5 0.5 0.5 RG\n0.3 w\n[3 2] 0 d\n';
    stream += drawPolyline(piece.seamAllowance, pageH, true);
    stream += 'S\n';
  }

  // Grainline — green arrow
  if (piece.grainline && config.includeGrainline) {
    const gl = piece.grainline;
    stream += '0 0.6 0 RG\n0.4 w\n[] 0 d\n';
    stream += `${tx(gl.start[0])} ${ty(gl.start[1], pageH)} m\n`;
    stream += `${tx(gl.end[0])} ${ty(gl.end[1], pageH)} l\nS\n`;

    // Arrow head
    const dx = gl.end[0] - gl.start[0];
    const dy = gl.end[1] - gl.start[1];
    const len = Math.hypot(dx, dy);
    if (len > 0) {
      const ux = dx / len, uy = dy / len;
      const as = 4;
      const ax1 = gl.end[0] - ux * as + uy * as * 0.4;
      const ay1 = gl.end[1] - uy * as - ux * as * 0.4;
      const ax2 = gl.end[0] - ux * as - uy * as * 0.4;
      const ay2 = gl.end[1] - uy * as + ux * as * 0.4;
      stream += `${tx(gl.end[0])} ${ty(gl.end[1], pageH)} m\n`;
      stream += `${tx(ax1)} ${ty(ay1, pageH)} l\n`;
      stream += `${tx(ax2)} ${ty(ay2, pageH)} l\nf\n`;
    }
  }

  // Notches — red marks
  if (piece.notches && config.includeNotches) {
    stream += '1 0 0 RG\n0.4 w\n[] 0 d\n';
    for (const notch of piece.notches) {
      const [nx, ny] = notch.position;
      const nLen = 3;
      stream += `${tx(nx)} ${ty(ny - nLen, pageH)} m\n`;
      stream += `${tx(nx)} ${ty(ny + nLen, pageH)} l\nS\n`;
    }
  }

  // Label
  if (config.includeLabels) {
    // Compute centroid from outline
    let cx = 0, cy = 0;
    const nPts = piece.outline.length / 2;
    for (let i = 0; i < piece.outline.length; i += 2) {
      cx += piece.outline[i];
      cy += piece.outline[i + 1];
    }
    if (nPts > 0) {
      cx /= nPts;
      cy /= nPts;
    }
    const fontSize = 2.5 * MM_TO_PT;
    stream += `0 0 0 RG\n`;
    // Escape parens in name
    const safeName = piece.pieceName.replace(/[()\\]/g, '\\$&');
    stream += `BT /F1 ${fontSize.toFixed(1)} Tf ${tx(cx)} ${ty(cy, pageH)} Td (${safeName}) Tj ET\n`;
  }

  return stream;
}

function renderPage(
  page: LayoutPage,
  config: CuttingLayoutConfig,
  layout: LayoutResult,
  isFirst: boolean,
): string {
  let stream = '';

  // Title block on first page
  if (isFirst) {
    stream += renderTitleBlock(page.width, page.height, config, layout);
  }

  // Tile info
  if (page.tileRow !== undefined && page.tileCol !== undefined) {
    stream += drawAlignmentMarks(page.width, page.height, page.tileRow, page.tileCol);

    // Tile coordinate label
    const totalPages = layout.pages.length;
    const label = `${page.tileCol + 1},${page.tileRow + 1} / ${totalPages}`;
    const fontSize = 2 * MM_TO_PT;
    stream += `0.4 0.4 0.4 RG\n`;
    stream += `BT /F1 ${fontSize.toFixed(1)} Tf ${tx(page.width - 40)} ${ty(5, page.height)} Td (${label}) Tj ET\n`;
  }

  // Pieces
  for (const piece of page.pieces) {
    stream += renderPiece(piece, page.height, config);
  }

  return stream;
}

// ─── PDF Builder ───

export async function exportCuttingPDF(
  layout: LayoutResult,
  config: CuttingLayoutConfig,
  filename?: string,
): Promise<Blob> {
  if (layout.pages.length === 0) {
    // Return empty PDF
    const emptyPdf = '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\nxref\n0 3\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \ntrailer\n<< /Size 3 /Root 1 0 R >>\nstartxref\n109\n%%EOF\n';
    return new Blob([emptyPdf], { type: 'application/pdf' });
  }

  const objects: string[] = [];
  let objCount = 0;

  const addObj = (content: string): number => {
    objCount++;
    objects.push(`${objCount} 0 obj\n${content}\nendobj\n`);
    return objCount;
  };

  // Font (shared)
  const fontObjId = 1; // will be obj 1
  addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  // Build page objects
  const pageObjIds: number[] = [];
  const contentObjIds: number[] = [];

  for (let i = 0; i < layout.pages.length; i++) {
    const page = layout.pages[i];
    const stream = renderPage(page, config, layout, i === 0);
    const streamBytes = new TextEncoder().encode(stream);

    // Content stream object
    const contentId = addObj(`<< /Length ${streamBytes.length} >>\nstream\n${stream}endstream`);
    contentObjIds.push(contentId);

    // Page object (parent ref will be patched)
    const pageW = (page.width * MM_TO_PT).toFixed(2);
    const pageH = (page.height * MM_TO_PT).toFixed(2);
    const pageId = addObj(
      `<< /Type /Page /Parent PAGES_REF /MediaBox [0 0 ${pageW} ${pageH}] ` +
      `/Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontObjId} 0 R >> >> >>`,
    );
    pageObjIds.push(pageId);
  }

  // Pages object
  const kidsStr = pageObjIds.map(id => `${id} 0 R`).join(' ');
  const pagesId = addObj(`<< /Type /Pages /Kids [${kidsStr}] /Count ${pageObjIds.length} >>`);

  // Catalog
  const catalogId = addObj(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

  // Patch PAGES_REF in page objects
  for (let i = 0; i < objects.length; i++) {
    objects[i] = objects[i].replace(/PAGES_REF/g, `${pagesId} 0 R`);
  }

  // Build PDF bytes
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
  pdf += `trailer\n<< /Size ${objCount + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  const blob = new Blob([pdf], { type: 'application/pdf' });

  // Auto-download if filename provided (browser context)
  if (filename && typeof document !== 'undefined') {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return blob;
}
