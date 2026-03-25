import type { FormatId, FormatProfile, DXFDocument } from './types';

function gerberDetectHook(doc: DXFDocument): number {
  const maintVer = doc.header?.get('$ACAD_MAINT_VER');
  if (maintVer !== undefined) return 20;
  return 0;
}

function lectraDetectHook(doc: DXFDocument): number {
  for (const [key] of doc.header) {
    if (key.startsWith('$LECTRA') || key.startsWith('$IBA')) return 30;
  }
  return 0;
}

export const FORMAT_PROFILES: Record<FormatId, FormatProfile> = {
  aama: {
    id: 'aama', name: 'AAMA / DXF-AAMA',
    layerMap: {
      '1': 'cut', 'CUT': 'cut',
      '4': 'notch', 'NOTCH': 'notch',
      '7': 'grainline', 'GRAINLINE': 'grainline',
      '8': 'draw', 'DRAW': 'draw',
      '11': 'intcut', 'INTCUT': 'intcut',
      '13': 'label', '14': 'label', '15': 'draw',
      'SEAM': 'seam', 'LABEL': 'label',
    },
    layerPatterns: [],
  },
  astm: {
    id: 'astm', name: 'ASTM D6673',
    layerMap: {
      'PIECE BOUNDARY': 'cut', 'SEW LINE': 'seam', 'INTERNAL LINE': 'intcut',
      'NOTCH': 'notch', 'GRAIN LINE': 'grainline', 'ANNOTATION': 'label',
      'DRILL HOLE': 'notch', 'STRIPE': 'draw', 'PLAID': 'draw',
    },
    layerPatterns: [
      { pattern: /piece\s*bound/i, role: 'cut' },
      { pattern: /sew\s*line/i, role: 'seam' },
      { pattern: /grain\s*line/i, role: 'grainline' },
      { pattern: /internal\s*line/i, role: 'intcut' },
    ],
  },
  gerber: {
    id: 'gerber', name: 'Gerber AccuMark',
    layerMap: {
      'PERIMETER': 'cut', 'TURN POINTS': 'notch', 'STRIPE': 'draw',
      'ANNOTATION': 'label', 'INTERNAL': 'intcut', 'DRILL HOLE': 'notch', 'GRAIN': 'grainline',
    },
    layerPatterns: [
      { pattern: /perim/i, role: 'cut' },
      { pattern: /turn\s*point/i, role: 'notch' },
      { pattern: /grain/i, role: 'grainline' },
    ],
    detectHook: gerberDetectHook,
  },
  lectra: {
    id: 'lectra', name: 'Lectra IBA',
    layerMap: {
      'CONTOUR': 'cut', 'COUTURE': 'seam', 'DROIT_FIL': 'grainline',
      'CRAN': 'notch', 'INT': 'intcut', 'PINCE': 'intcut', 'TEXTE': 'label',
    },
    layerPatterns: [
      { pattern: /contour/i, role: 'cut' },
      { pattern: /couture/i, role: 'seam' },
      { pattern: /droit.fil/i, role: 'grainline' },
    ],
    detectHook: lectraDetectHook,
  },
  standard: { id: 'standard', name: 'Standard DXF', layerMap: {}, layerPatterns: [] },
};

export function getProfile(id: FormatId): FormatProfile {
  return FORMAT_PROFILES[id];
}
