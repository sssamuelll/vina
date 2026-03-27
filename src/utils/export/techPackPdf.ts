/**
 * Tech Pack PDF Generator — multi-page garment specification document.
 *
 * Uses raw PDF operators (same approach as pdfCuttingExport.ts) — no external dependencies.
 * Produces A4 pages: Cover, 3D Views, Measurements, BOM, Construction Notes, Colorways.
 *
 * Binary-safe: builds the PDF as Uint8Array to correctly embed JPEG image data.
 */

import type { TechPackConfig, TechPackData } from '../../types/bom';

// ─── Constants ───

const MM_TO_PT = 72 / 25.4;
const PAGE_W = 210; // A4 width mm
const PAGE_H = 297; // A4 height mm
const PAGE_W_PT = (PAGE_W * MM_TO_PT).toFixed(2);
const PAGE_H_PT = (PAGE_H * MM_TO_PT).toFixed(2);
const MARGIN = 15; // mm
const CONTENT_W = PAGE_W - 2 * MARGIN; // usable width mm

// ─── PDF Coordinate Helpers ───

function tx(x: number): string {
  return (x * MM_TO_PT).toFixed(2);
}

function ty(y: number): string {
  return ((PAGE_H - y) * MM_TO_PT).toFixed(2);
}

/** Escape parentheses and backslashes for PDF text strings. */
function pdfEscape(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/** Convert a hex color string (#RRGGBB) to PDF RGB components (0-1 each). */
function hexToRGB(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16) / 255;
  const g = parseInt(h.substring(2, 4), 16) / 255;
  const b = parseInt(h.substring(4, 6), 16) / 255;
  return [r, g, b];
}

/** Word-wrap text to fit within a given width at a given font size (approximate). */
function wordWrap(text: string, maxWidthMM: number, fontSizeMM: number): string[] {
  // Approximate: Helvetica average character width ~0.5 * fontSize
  const charWidthMM = fontSizeMM * 0.5;
  const maxChars = Math.floor(maxWidthMM / charWidthMM);
  if (maxChars <= 0) return [text];

  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (testLine.length > maxChars && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

// ─── JPEG Parsing ───

/** Parse JPEG dimensions from raw JPEG bytes by scanning for SOF0/SOF2 markers. */
function parseJpegDimensions(data: Uint8Array): { width: number; height: number } | null {
  let offset = 0;
  // Verify JPEG SOI marker
  if (data[0] !== 0xFF || data[1] !== 0xD8) return null;
  offset = 2;

  while (offset < data.length - 1) {
    if (data[offset] !== 0xFF) {
      offset++;
      continue;
    }
    const marker = data[offset + 1];
    offset += 2;

    // SOF0 (0xC0) or SOF2 (0xC2) — baseline or progressive
    if (marker === 0xC0 || marker === 0xC2) {
      if (offset + 7 > data.length) return null;
      // Skip length (2 bytes) and precision (1 byte)
      const height = (data[offset + 3] << 8) | data[offset + 4];
      const width = (data[offset + 5] << 8) | data[offset + 6];
      return { width, height };
    }

    // Skip segment
    if (marker === 0xD9) break; // EOI
    if (marker === 0xDA) break; // SOS — no more metadata
    if (offset + 1 < data.length) {
      const segLen = (data[offset] << 8) | data[offset + 1];
      offset += segLen;
    } else {
      break;
    }
  }
  return null;
}

/** Decode a base64 data URL to raw bytes. */
function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1];
  if (!base64) return new Uint8Array(0);
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// ─── Binary PDF Builder ───

/**
 * Concatenate an array of Uint8Arrays into one.
 */
function concatBytes(arrays: Uint8Array[]): Uint8Array {
  let totalLength = 0;
  for (const arr of arrays) totalLength += arr.length;
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

const encoder = new TextEncoder();

/** Encode a string to UTF-8 bytes. */
function strBytes(s: string): Uint8Array {
  return encoder.encode(s);
}

// ─── Page Content Builders ───

interface ImageXObject {
  objId: number;
  name: string; // e.g., "Img0"
}

function buildCoverPage(data: TechPackData, config: TechPackConfig): string {
  let s = '';
  let cursorY = MARGIN; // mm from top

  // Optional header bar
  if (config.branding?.headerColor) {
    const [r, g, b] = hexToRGB(config.branding.headerColor);
    const barH = 18;
    s += `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg\n`;
    s += `${tx(0)} ${ty(cursorY)} ${tx(PAGE_W)} ${tx(-barH)} re f\n`;

    // Company name in white
    if (config.branding.companyName) {
      const fontSize = 5 * MM_TO_PT;
      s += `1 1 1 rg\n`;
      s += `BT /F1 ${fontSize.toFixed(1)} Tf ${tx(MARGIN)} ${ty(cursorY + 12)} Td (${pdfEscape(config.branding.companyName)}) Tj ET\n`;
    }
    cursorY += 18 + 8;
  } else {
    cursorY += 10;
  }

  // Reset fill to black
  s += '0 0 0 rg\n';

  // "TECH PACK" title
  const titleFontSize = 8 * MM_TO_PT;
  s += `BT /F2 ${titleFontSize.toFixed(1)} Tf ${tx(MARGIN)} ${ty(cursorY + 8)} Td (TECH PACK) Tj ET\n`;
  cursorY += 18;

  // Garment name
  const nameFontSize = 5 * MM_TO_PT;
  s += `BT /F1 ${nameFontSize.toFixed(1)} Tf ${tx(MARGIN)} ${ty(cursorY + 5)} Td (${pdfEscape(data.garmentName)}) Tj ET\n`;
  cursorY += 12;

  // Divider line
  s += '0.7 0.7 0.7 RG\n0.5 w\n';
  s += `${tx(MARGIN)} ${ty(cursorY)} m ${tx(PAGE_W - MARGIN)} ${ty(cursorY)} l S\n`;
  cursorY += 6;

  // Info fields
  const fieldFontSize = 3.2 * MM_TO_PT;
  const labelFontSize = 2.8 * MM_TO_PT;
  const lineH = 8;

  const fields: [string, string][] = [
    ['Style', data.garmentName],
    ['Style Number', data.styleNumber],
    ['Season', data.season],
    ['Designer', data.designer],
    ['Date', data.date],
  ];

  for (const [label, value] of fields) {
    // Label (bold)
    s += `0.4 0.4 0.4 rg\n`;
    s += `BT /F2 ${labelFontSize.toFixed(1)} Tf ${tx(MARGIN)} ${ty(cursorY + 3.5)} Td (${pdfEscape(label)}:) Tj ET\n`;
    // Value
    s += `0 0 0 rg\n`;
    s += `BT /F1 ${fieldFontSize.toFixed(1)} Tf ${tx(MARGIN + 40)} ${ty(cursorY + 3.5)} Td (${pdfEscape(value)}) Tj ET\n`;
    cursorY += lineH;
  }

  cursorY += 6;

  // Description
  if (data.description) {
    s += `0.4 0.4 0.4 rg\n`;
    s += `BT /F2 ${labelFontSize.toFixed(1)} Tf ${tx(MARGIN)} ${ty(cursorY + 3.5)} Td (Description:) Tj ET\n`;
    cursorY += 6;

    s += `0 0 0 rg\n`;
    const descFontSizeMM = 3;
    const descFontSizePt = descFontSizeMM * MM_TO_PT;
    const lines = wordWrap(data.description, CONTENT_W, descFontSizeMM);
    for (const line of lines) {
      s += `BT /F1 ${descFontSizePt.toFixed(1)} Tf ${tx(MARGIN)} ${ty(cursorY + 3)} Td (${pdfEscape(line)}) Tj ET\n`;
      cursorY += 5;
    }
  }

  return s;
}

function build3DViewsPage(data: TechPackData, imageXObjects: ImageXObject[]): string {
  let s = '';
  let cursorY = MARGIN;

  // Title
  const titleFontSize = 5 * MM_TO_PT;
  s += `0 0 0 rg\n`;
  s += `BT /F2 ${titleFontSize.toFixed(1)} Tf ${tx(MARGIN)} ${ty(cursorY + 5)} Td (3D VIEWS) Tj ET\n`;
  cursorY += 14;

  // Layout: up to 4 images in a 2x2 grid
  const imgSlotW = (CONTENT_W - 10) / 2; // mm per image slot
  const imgSlotH = 100; // mm per image slot
  const labelFontSize = 2.5 * MM_TO_PT;

  const maxImages = Math.min(data.images.length, 4, imageXObjects.length);
  for (let i = 0; i < maxImages; i++) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const slotX = MARGIN + col * (imgSlotW + 10);
    const slotY = cursorY + row * (imgSlotH + 12);

    // View label
    const viewLabel = data.images[i].view.charAt(0).toUpperCase() + data.images[i].view.slice(1);
    s += `0.3 0.3 0.3 rg\n`;
    s += `BT /F1 ${labelFontSize.toFixed(1)} Tf ${tx(slotX)} ${ty(slotY + 3)} Td (${pdfEscape(viewLabel)}) Tj ET\n`;

    // Image placement — parse dimensions for aspect ratio
    const jpegBytes = dataUrlToBytes(data.images[i].dataUrl);
    const dims = parseJpegDimensions(jpegBytes);
    let imgW = imgSlotW;
    let imgH = imgSlotH - 6;

    if (dims && dims.width > 0 && dims.height > 0) {
      const aspect = dims.width / dims.height;
      const slotAspect = imgW / imgH;
      if (aspect > slotAspect) {
        // Image is wider — constrain by width
        imgH = imgW / aspect;
      } else {
        // Image is taller — constrain by height
        imgW = imgH * aspect;
      }
    }

    const imgX = slotX;
    const imgY = slotY + 5; // below label
    // PDF image placement: q [w 0 0 h x y] cm /ImgN Do Q
    // y in PDF coords is bottom-left of image
    const imgXPt = (imgX * MM_TO_PT).toFixed(2);
    const imgYPt = ((PAGE_H - imgY - imgH) * MM_TO_PT).toFixed(2);
    const imgWPt = (imgW * MM_TO_PT).toFixed(2);
    const imgHPt = (imgH * MM_TO_PT).toFixed(2);

    s += `q\n${imgWPt} 0 0 ${imgHPt} ${imgXPt} ${imgYPt} cm\n/${imageXObjects[i].name} Do\nQ\n`;
  }

  return s;
}

function buildMeasurementsPage(data: TechPackData): string {
  let s = '';
  let cursorY = MARGIN;

  // Title
  const titleFontSize = 5 * MM_TO_PT;
  s += `0 0 0 rg\n`;
  s += `BT /F2 ${titleFontSize.toFixed(1)} Tf ${tx(MARGIN)} ${ty(cursorY + 5)} Td (MEASUREMENTS) Tj ET\n`;
  cursorY += 14;

  // Table layout — column positions (mm from left edge)
  const colX = [MARGIN, MARGIN + 65, MARGIN + 105, MARGIN + 140];
  const colLabels = ['Measurement', 'Category', 'Value', 'Tolerance'];
  const rowH = 7;
  const headerFontSize = 2.8 * MM_TO_PT;
  const cellFontSize = 2.5 * MM_TO_PT;
  const tableW = CONTENT_W;

  // Header row — gray background
  s += '0.9 0.9 0.9 rg\n';
  s += `${tx(MARGIN)} ${ty(cursorY)} ${tx(tableW)} ${tx(-rowH)} re f\n`;
  s += '0 0 0 rg\n';

  for (let c = 0; c < colLabels.length; c++) {
    s += `BT /F2 ${headerFontSize.toFixed(1)} Tf ${tx(colX[c] + 2)} ${ty(cursorY + 5)} Td (${colLabels[c]}) Tj ET\n`;
  }
  cursorY += rowH;

  // Header bottom line
  s += '0.7 0.7 0.7 RG\n0.3 w\n';
  s += `${tx(MARGIN)} ${ty(cursorY)} m ${tx(PAGE_W - MARGIN)} ${ty(cursorY)} l S\n`;

  // Data rows
  for (const m of data.measurements) {
    if (cursorY + rowH > PAGE_H - MARGIN) break; // prevent overflow

    const tolStr = m.tolerance !== undefined ? `+/- ${m.tolerance.toFixed(1)}` : '-';
    const rowData = [m.name, m.category, m.value.toFixed(1), tolStr];

    s += '0 0 0 rg\n';
    for (let c = 0; c < rowData.length; c++) {
      s += `BT /F1 ${cellFontSize.toFixed(1)} Tf ${tx(colX[c] + 2)} ${ty(cursorY + 5)} Td (${pdfEscape(rowData[c])}) Tj ET\n`;
    }
    cursorY += rowH;

    // Divider
    s += '0.85 0.85 0.85 RG\n0.2 w\n';
    s += `${tx(MARGIN)} ${ty(cursorY)} m ${tx(PAGE_W - MARGIN)} ${ty(cursorY)} l S\n`;
  }

  return s;
}

function buildBOMPage(data: TechPackData): string {
  let s = '';
  let cursorY = MARGIN;

  // Title
  const titleFontSize = 5 * MM_TO_PT;
  s += `0 0 0 rg\n`;
  s += `BT /F2 ${titleFontSize.toFixed(1)} Tf ${tx(MARGIN)} ${ty(cursorY + 5)} Td (BILL OF MATERIALS) Tj ET\n`;
  cursorY += 14;

  // Table columns
  const colX = [MARGIN, MARGIN + 50, MARGIN + 85, MARGIN + 105, MARGIN + 125, MARGIN + 150];
  const colLabels = ['Item', 'Category', 'Qty', 'Unit', 'Unit Cost', 'Total'];
  const rowH = 7;
  const headerFontSize = 2.8 * MM_TO_PT;
  const cellFontSize = 2.5 * MM_TO_PT;
  const tableW = CONTENT_W;

  // Header row — gray background
  s += '0.9 0.9 0.9 rg\n';
  s += `${tx(MARGIN)} ${ty(cursorY)} ${tx(tableW)} ${tx(-rowH)} re f\n`;
  s += '0 0 0 rg\n';

  for (let c = 0; c < colLabels.length; c++) {
    s += `BT /F2 ${headerFontSize.toFixed(1)} Tf ${tx(colX[c] + 2)} ${ty(cursorY + 5)} Td (${colLabels[c]}) Tj ET\n`;
  }
  cursorY += rowH;

  // Header bottom line
  s += '0.7 0.7 0.7 RG\n0.3 w\n';
  s += `${tx(MARGIN)} ${ty(cursorY)} m ${tx(PAGE_W - MARGIN)} ${ty(cursorY)} l S\n`;

  // Data rows
  const formatCost = (val: number, currency: string): string => {
    return `${currency} ${val.toFixed(2)}`;
  };

  for (const entry of data.bomEntries) {
    if (cursorY + rowH > PAGE_H - MARGIN - 14) break; // leave room for total

    const rowData = [
      entry.resolvedName,
      entry.category,
      entry.quantity.toFixed(1),
      entry.unit,
      formatCost(entry.resolvedUnitCost, data.currency),
      formatCost(entry.totalCost, data.currency),
    ];

    s += '0 0 0 rg\n';
    for (let c = 0; c < rowData.length; c++) {
      s += `BT /F1 ${cellFontSize.toFixed(1)} Tf ${tx(colX[c] + 2)} ${ty(cursorY + 5)} Td (${pdfEscape(rowData[c])}) Tj ET\n`;
    }
    cursorY += rowH;

    // Divider
    s += '0.85 0.85 0.85 RG\n0.2 w\n';
    s += `${tx(MARGIN)} ${ty(cursorY)} m ${tx(PAGE_W - MARGIN)} ${ty(cursorY)} l S\n`;
  }

  // Grand total — double rule
  cursorY += 3;
  s += '0 0 0 RG\n0.5 w\n';
  s += `${tx(MARGIN)} ${ty(cursorY)} m ${tx(PAGE_W - MARGIN)} ${ty(cursorY)} l S\n`;
  cursorY += 1;
  s += `${tx(MARGIN)} ${ty(cursorY)} m ${tx(PAGE_W - MARGIN)} ${ty(cursorY)} l S\n`;
  cursorY += 5;

  const totalFontSize = 3.2 * MM_TO_PT;
  s += `0 0 0 rg\n`;
  s += `BT /F2 ${totalFontSize.toFixed(1)} Tf ${tx(colX[4] + 2)} ${ty(cursorY + 3.5)} Td (Grand Total:) Tj ET\n`;
  s += `BT /F2 ${totalFontSize.toFixed(1)} Tf ${tx(colX[5] + 2)} ${ty(cursorY + 3.5)} Td (${pdfEscape(formatCost(data.totalCost, data.currency))}) Tj ET\n`;

  return s;
}

function buildConstructionNotesPage(data: TechPackData): string {
  let s = '';
  let cursorY = MARGIN;

  // Title
  const titleFontSize = 5 * MM_TO_PT;
  s += `0 0 0 rg\n`;
  s += `BT /F2 ${titleFontSize.toFixed(1)} Tf ${tx(MARGIN)} ${ty(cursorY + 5)} Td (CONSTRUCTION NOTES) Tj ET\n`;
  cursorY += 14;

  const bulletFontSize = 3 * MM_TO_PT;
  const noteFontSizeMM = 3;
  const lineH = 5;
  const bulletIndent = MARGIN + 5;
  const textMaxW = CONTENT_W - 5;

  for (const note of data.constructionNotes) {
    if (cursorY + lineH > PAGE_H - MARGIN) break;

    // Bullet
    s += `0 0 0 rg\n`;
    s += `BT /F1 ${bulletFontSize.toFixed(1)} Tf ${tx(MARGIN)} ${ty(cursorY + 3)} Td (\\267) Tj ET\n`; // bullet char

    // Note text with word wrap
    const lines = wordWrap(note, textMaxW, noteFontSizeMM);
    for (const line of lines) {
      if (cursorY + lineH > PAGE_H - MARGIN) break;
      s += `BT /F1 ${bulletFontSize.toFixed(1)} Tf ${tx(bulletIndent)} ${ty(cursorY + 3)} Td (${pdfEscape(line)}) Tj ET\n`;
      cursorY += lineH;
    }
    cursorY += 2; // spacing between notes
  }

  return s;
}

function buildColorwaysPage(data: TechPackData): string {
  let s = '';
  let cursorY = MARGIN;

  // Title
  const titleFontSize = 5 * MM_TO_PT;
  s += `0 0 0 rg\n`;
  s += `BT /F2 ${titleFontSize.toFixed(1)} Tf ${tx(MARGIN)} ${ty(cursorY + 5)} Td (COLORWAYS) Tj ET\n`;
  cursorY += 14;

  const nameFontSize = 3.5 * MM_TO_PT;
  const labelFontSize = 2.2 * MM_TO_PT;
  const swatchSize = 12; // mm
  const swatchGap = 4; // mm

  for (const colorway of data.colorways) {
    if (cursorY + swatchSize + 14 > PAGE_H - MARGIN) break;

    // Colorway name
    s += `0 0 0 rg\n`;
    s += `BT /F2 ${nameFontSize.toFixed(1)} Tf ${tx(MARGIN)} ${ty(cursorY + 4)} Td (${pdfEscape(colorway.name)}) Tj ET\n`;
    cursorY += 8;

    // Swatch rectangles
    let swatchX = MARGIN;
    for (const swatch of colorway.swatches) {
      if (swatchX + swatchSize > PAGE_W - MARGIN) {
        // Wrap to next row
        swatchX = MARGIN;
        cursorY += swatchSize + 8;
        if (cursorY + swatchSize + 6 > PAGE_H - MARGIN) break;
      }

      // Color swatch
      const [r, g, b] = hexToRGB(swatch.color);
      s += `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg\n`;
      s += `${tx(swatchX)} ${ty(cursorY)} ${tx(swatchSize)} ${tx(-swatchSize)} re f\n`;

      // Border
      s += '0.6 0.6 0.6 RG\n0.3 w\n';
      s += `${tx(swatchX)} ${ty(cursorY)} ${tx(swatchSize)} ${tx(-swatchSize)} re S\n`;

      // Fabric code label below swatch
      s += `0 0 0 rg\n`;
      s += `BT /F1 ${labelFontSize.toFixed(1)} Tf ${tx(swatchX)} ${ty(cursorY + swatchSize + 3)} Td (${pdfEscape(swatch.fabricCode)}) Tj ET\n`;

      swatchX += swatchSize + swatchGap;
    }

    cursorY += swatchSize + 10;
  }

  return s;
}

// ─── Main PDF Generator ───

export async function generateTechPackPDF(
  data: TechPackData,
  config: TechPackConfig,
  filename?: string,
): Promise<Blob> {
  // Track binary object parts — each object is stored as bytes.
  // textOnly[i] marks whether objectParts[i] is pure text (safe to patch PAGES_REF).
  const objectParts: Uint8Array[] = [];
  const textOnly: boolean[] = [];
  let objCount = 0;

  /** Add a text-only PDF object. Returns its object number. */
  const addTextObj = (content: string): number => {
    objCount++;
    const text = `${objCount} 0 obj\n${content}\nendobj\n`;
    objectParts.push(strBytes(text));
    textOnly.push(true);
    return objCount;
  };

  /** Add a binary PDF object (for image XObjects). Returns its object number. */
  const addBinaryObj = (header: string, binaryData: Uint8Array): number => {
    objCount++;
    const pre = strBytes(`${objCount} 0 obj\n${header}\nstream\n`);
    const post = strBytes('\nendstream\nendobj\n');
    objectParts.push(concatBytes([pre, binaryData, post]));
    textOnly.push(false);
    return objCount;
  };

  // ─── Fonts ───
  const fontHelveticaId = addTextObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const fontHelveticaBoldId = addTextObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');

  // ─── Image XObjects (for 3D Views page) ───
  const imageXObjects: ImageXObject[] = [];

  if (config.include3DViews && data.images.length > 0) {
    const maxImages = Math.min(data.images.length, 4);
    for (let i = 0; i < maxImages; i++) {
      const img = data.images[i];
      const jpegBytes = dataUrlToBytes(img.dataUrl);
      if (jpegBytes.length === 0) continue;

      const dims = parseJpegDimensions(jpegBytes);
      if (!dims) continue;

      const header =
        `<< /Type /XObject /Subtype /Image /Width ${dims.width} /Height ${dims.height} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>`;

      const imgObjId = addBinaryObj(header, jpegBytes);
      imageXObjects.push({ objId: imgObjId, name: `Img${i}` });
    }
  }

  // ─── Build pages ───

  interface PageDef {
    content: string;
    /** Image XObject references needed by this page. */
    xobjects: ImageXObject[];
  }

  const pages: PageDef[] = [];

  // Page 1: Cover (always present)
  pages.push({ content: buildCoverPage(data, config), xobjects: [] });

  // Page 2: 3D Views
  if (config.include3DViews && data.images.length > 0 && imageXObjects.length > 0) {
    pages.push({ content: build3DViewsPage(data, imageXObjects), xobjects: imageXObjects });
  }

  // Page 3: Measurements
  if (config.includeMeasurements && data.measurements.length > 0) {
    pages.push({ content: buildMeasurementsPage(data), xobjects: [] });
  }

  // Page 4: BOM
  if (config.includeBOM && data.bomEntries.length > 0) {
    pages.push({ content: buildBOMPage(data), xobjects: [] });
  }

  // Page 5: Construction Notes
  if (config.includeConstructionNotes && data.constructionNotes.length > 0) {
    pages.push({ content: buildConstructionNotesPage(data), xobjects: [] });
  }

  // Page 6: Colorways
  if (config.includeColorways && data.colorways.length > 1) {
    pages.push({ content: buildColorwaysPage(data), xobjects: [] });
  }

  // ─── Create content stream + page objects ───

  const pageObjIds: number[] = [];

  for (const pageDef of pages) {
    const streamBytes = strBytes(pageDef.content);

    // Content stream object
    const contentId = addTextObj(
      `<< /Length ${streamBytes.length} >>\nstream\n${pageDef.content}endstream`,
    );

    // Build resource dictionary
    let resourceDict =
      `/Font << /F1 ${fontHelveticaId} 0 R /F2 ${fontHelveticaBoldId} 0 R >>`;

    if (pageDef.xobjects.length > 0) {
      const xobjEntries = pageDef.xobjects
        .map(xo => `/${xo.name} ${xo.objId} 0 R`)
        .join(' ');
      resourceDict += ` /XObject << ${xobjEntries} >>`;
    }

    // Page object (parent ref patched later)
    const pageId = addTextObj(
      `<< /Type /Page /Parent PAGES_REF /MediaBox [0 0 ${PAGE_W_PT} ${PAGE_H_PT}] ` +
      `/Contents ${contentId} 0 R /Resources << ${resourceDict} >> >>`,
    );
    pageObjIds.push(pageId);
  }

  // ─── Pages object ───
  const kidsStr = pageObjIds.map(id => `${id} 0 R`).join(' ');
  const pagesId = addTextObj(
    `<< /Type /Pages /Kids [${kidsStr}] /Count ${pageObjIds.length} >>`,
  );

  // ─── Catalog ───
  const catalogId = addTextObj(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

  // ─── Patch PAGES_REF in text-only objects (skip binary image data) ───
  const pagesRef = `${pagesId} 0 R`;
  for (let i = 0; i < objectParts.length; i++) {
    if (!textOnly[i]) continue; // never decode/re-encode binary objects
    const text = new TextDecoder().decode(objectParts[i]);
    if (text.includes('PAGES_REF')) {
      objectParts[i] = strBytes(text.replace(/PAGES_REF/g, pagesRef));
    }
  }

  // ─── Assemble final PDF binary ───
  const header = strBytes('%PDF-1.4\n');
  // Binary comment to indicate binary content (recommended by PDF spec)
  const binaryComment = new Uint8Array([0x25, 0xE2, 0xE3, 0xCF, 0xD3, 0x0A]); // %âãÏÓ\n

  const allParts: Uint8Array[] = [header, binaryComment];
  const offsets: number[] = [];
  let currentOffset = header.length + binaryComment.length;

  for (const part of objectParts) {
    offsets.push(currentOffset);
    allParts.push(part);
    currentOffset += part.length;
  }

  // xref table
  let xref = `xref\n0 ${objCount + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    xref += `${off.toString().padStart(10, '0')} 00000 n \n`;
  }

  const xrefOffset = currentOffset;
  const xrefBytes = strBytes(xref);
  allParts.push(xrefBytes);

  const trailer = strBytes(
    `trailer\n<< /Size ${objCount + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  );
  allParts.push(trailer);

  const pdfBytes = concatBytes(allParts);
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });

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
