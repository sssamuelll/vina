/**
 * Parametric Pattern Templates
 * 
 * Each template generates PatternPiece(s) from body measurements.
 * These are real pattern blocks used in garment construction.
 * 
 * Coordinate system: 1 unit = 1mm
 * Origin: top-left of piece bounding box
 */

import { PatternPiece, PathCommand, InternalLine } from '../types/types';
import { uid, M, L, C, Z } from './pathHelpers';

interface BodyMeasurements {
  height: number;     // cm
  chest: number;      // cm
  waist: number;      // cm
  hips: number;       // cm
  shoulder: number;   // cm
  armLength: number;  // cm
  inseam: number;     // cm
  // Derived (calculated if not provided)
  neckCirc?: number;  // cm
  backLength?: number; // cm (nape to waist)
  frontLength?: number; // cm (shoulder to waist over bust)
  armholeDepth?: number; // cm
}

/** Convert cm to mm (our SVG units) */
const mm = (cm: number) => cm * 10;

/* Path helpers imported from ./pathHelpers */

/** Derive measurements that aren't directly provided */
function deriveMeasurements(m: BodyMeasurements): Required<BodyMeasurements> {
  return {
    ...m,
    neckCirc: m.neckCirc ?? m.chest * 0.36,
    backLength: m.backLength ?? m.height * 0.25,
    frontLength: m.frontLength ?? m.height * 0.26,
    armholeDepth: m.armholeDepth ?? m.height * 0.12 + 5,
  };
}

/** Create a grainline internal line */
function grainline(x: number, y1: number, y2: number): InternalLine {
  return {
    id: `gl-${Date.now()}-${Math.random().toString(36).slice(2, 4)}`,
    type: 'grainline',
    path: [M(x, y1), L(x, y2)],
  };
}

// ═══════════════════════════════════════════════════════
// BODICE BLOCK (Aldrich method, simplified)
// ═══════════════════════════════════════════════════════

export function generateBodiceBack(m: BodyMeasurements): PatternPiece {
  const d = deriveMeasurements(m);
  const halfChest = mm(d.chest) / 4 + 10; // ease
  const shoulderW = mm(d.shoulder) / 2;
  const backL = mm(d.backLength);
  const armD = mm(d.armholeDepth);
  const neckW = mm(d.neckCirc) / 6 + 5;
  const neckD = 20; // back neck depth ~2cm

  const outline: PathCommand[] = [
    M(0, neckD),
    // Neck curve
    C(0, neckD * 0.3, neckW * 0.5, 0, neckW, 0),
    // Shoulder line
    L(shoulderW, armD * 0.15),
    // Armhole curve
    C(shoulderW + 10, armD * 0.4, halfChest + 5, armD * 0.7, halfChest, armD),
    // Side seam
    L(halfChest, backL),
    // Waist
    L(0, backL),
    Z(),
  ];

  return {
    id: uid(),
    name: 'Back Bodice',
    outline,
    internals: [grainline(halfChest / 2, armD * 0.3, backL - 20)],
    position: { x: 50, y: 50 },
    rotation: 0,
    mirrored: false,
    seamAllowance: 10,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function generateBodiceFront(m: BodyMeasurements): PatternPiece {
  const d = deriveMeasurements(m);
  const halfChest = mm(d.chest) / 4 + 10;
  const shoulderW = mm(d.shoulder) / 2;
  const frontL = mm(d.frontLength);
  const armD = mm(d.armholeDepth);
  const neckW = mm(d.neckCirc) / 6 + 5;
  const neckD = mm(d.neckCirc) / 6 + 15; // front neck deeper

  const outline: PathCommand[] = [
    M(0, neckD),
    // Neck curve (deeper V for front)
    C(0, neckD * 0.4, neckW * 0.3, 5, neckW, 0),
    // Shoulder
    L(shoulderW, armD * 0.15),
    // Armhole
    C(shoulderW + 10, armD * 0.45, halfChest + 5, armD * 0.75, halfChest, armD),
    // Side seam
    L(halfChest, frontL),
    // Waist
    L(0, frontL),
    Z(),
  ];

  // Bust dart
  const bustDartX = halfChest * 0.4;
  const dartTop = armD + 20;
  const dartBottom = frontL - 30;
  const bustDart: InternalLine = {
    id: `dart-${Date.now()}`,
    type: 'dart',
    path: [M(bustDartX - 15, dartBottom), L(bustDartX, dartTop), L(bustDartX + 15, dartBottom)],
  };

  return {
    id: uid(),
    name: 'Front Bodice',
    outline,
    internals: [
      grainline(halfChest / 2, armD * 0.3, frontL - 20),
      bustDart,
    ],
    position: { x: 50 + halfChest + 40, y: 50 },
    rotation: 0,
    mirrored: false,
    seamAllowance: 10,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ═══════════════════════════════════════════════════════
// SLEEVE BLOCK
// ═══════════════════════════════════════════════════════

export function generateSleeve(m: BodyMeasurements): PatternPiece {
  const d = deriveMeasurements(m);
  const armL = mm(d.armLength);
  const chestHalf = mm(d.chest) / 4;
  const sleeveW = chestHalf * 0.8; // sleeve width based on chest
  const capH = mm(d.armholeDepth) * 0.55; // sleeve cap height

  const outline: PathCommand[] = [
    M(0, capH),
    // Sleeve cap curve (bell shape)
    C(0, capH * 0.3, sleeveW * 0.25, 0, sleeveW / 2, 0),
    C(sleeveW * 0.75, 0, sleeveW, capH * 0.3, sleeveW, capH),
    // Underarm to wrist
    L(sleeveW * 0.85, armL),
    // Wrist
    L(sleeveW * 0.15, armL),
    Z(),
  ];

  return {
    id: uid(),
    name: 'Sleeve',
    outline,
    internals: [grainline(sleeveW / 2, capH * 0.5, armL - 20)],
    position: { x: 50, y: 400 },
    rotation: 0,
    mirrored: false,
    seamAllowance: 10,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ═══════════════════════════════════════════════════════
// SKIRT BLOCK (A-line)
// ═══════════════════════════════════════════════════════

export function generateSkirtFront(m: BodyMeasurements, lengthCm = 60): PatternPiece {
  const waistQ = mm(m.waist) / 4 + 5; // quarter waist + ease
  const hipQ = mm(m.hips) / 4 + 5;
  const hipDrop = 200; // hip line ~20cm below waist
  const skirtL = mm(lengthCm);
  const hemW = hipQ + 20; // slight A-line flare

  const outline: PathCommand[] = [
    M(0, 0),
    // Waist
    L(waistQ, 0),
    // Side seam: waist to hip (slight curve)
    C(waistQ + 5, hipDrop * 0.3, hipQ, hipDrop * 0.7, hipQ, hipDrop),
    // Hip to hem
    L(hemW, skirtL),
    // Hem
    L(0, skirtL),
    Z(),
  ];

  // Waist dart
  const dartX = waistQ * 0.45;
  const dartDepth = hipDrop * 0.7;
  const dart: InternalLine = {
    id: `dart-${Date.now()}`,
    type: 'dart',
    path: [M(dartX - 10, 0), L(dartX, dartDepth), L(dartX + 10, 0)],
  };

  return {
    id: uid(),
    name: 'Front Skirt',
    outline,
    internals: [
      grainline(waistQ / 2, 30, skirtL - 30),
      dart,
    ],
    position: { x: 50, y: 50 },
    rotation: 0,
    mirrored: false,
    seamAllowance: 10,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function generateSkirtBack(m: BodyMeasurements, lengthCm = 60): PatternPiece {
  const waistQ = mm(m.waist) / 4 + 5;
  const hipQ = mm(m.hips) / 4 + 5;
  const hipDrop = 200;
  const skirtL = mm(lengthCm);
  const hemW = hipQ + 20;

  const outline: PathCommand[] = [
    M(0, 0),
    L(waistQ, 0),
    C(waistQ + 5, hipDrop * 0.3, hipQ, hipDrop * 0.7, hipQ, hipDrop),
    L(hemW, skirtL),
    L(0, skirtL),
    Z(),
  ];

  const dartX = waistQ * 0.45;
  const dartDepth = hipDrop * 0.75;
  const dart: InternalLine = {
    id: `dart-${Date.now()}-b`,
    type: 'dart',
    path: [M(dartX - 12, 0), L(dartX, dartDepth), L(dartX + 12, 0)],
  };

  return {
    id: uid(),
    name: 'Back Skirt',
    outline,
    internals: [
      grainline(waistQ / 2, 30, skirtL - 30),
      dart,
    ],
    position: { x: 50 + hipQ + 60, y: 50 },
    rotation: 0,
    mirrored: false,
    seamAllowance: 10,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ═══════════════════════════════════════════════════════
// PANTS BLOCK (basic trouser)
// ═══════════════════════════════════════════════════════

export function generatePantsFront(m: BodyMeasurements, _lengthCm?: number): PatternPiece {
  const waistQ = mm(m.waist) / 4 + 5;
  const hipQ = mm(m.hips) / 4 + 5;
  const inseamL = mm(m.inseam);
  const hipDrop = 200;
  const crotchExt = hipQ * 0.25; // front crotch extension
  const kneeW = hipQ * 0.55;
  const hemW = hipQ * 0.5;
  const totalL = hipDrop + inseamL;

  const outline: PathCommand[] = [
    M(crotchExt, 0),
    // Waist
    L(crotchExt + waistQ, 0),
    // Side seam to hip
    C(crotchExt + waistQ + 5, hipDrop * 0.4, crotchExt + hipQ, hipDrop * 0.8, crotchExt + hipQ, hipDrop),
    // Side seam to knee to hem
    L(crotchExt + kneeW, totalL * 0.6),
    L(crotchExt + hemW, totalL),
    // Hem
    L(crotchExt - hemW * 0.1, totalL),
    // Inseam
    L(crotchExt - kneeW * 0.05, totalL * 0.6),
    // Crotch curve
    C(0, hipDrop + 20, 0, hipDrop * 0.5, crotchExt, 0),
    Z(),
  ];

  return {
    id: uid(),
    name: 'Front Pants',
    outline,
    internals: [grainline(crotchExt + waistQ / 2, 40, totalL - 40)],
    position: { x: 50, y: 50 },
    rotation: 0,
    mirrored: false,
    seamAllowance: 10,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function generatePantsBack(m: BodyMeasurements): PatternPiece {
  const waistQ = mm(m.waist) / 4 + 8; // back wider
  const hipQ = mm(m.hips) / 4 + 8;
  const inseamL = mm(m.inseam);
  const hipDrop = 200;
  const crotchExt = hipQ * 0.35; // back crotch wider
  const kneeW = hipQ * 0.58;
  const hemW = hipQ * 0.52;
  const totalL = hipDrop + inseamL;

  const outline: PathCommand[] = [
    M(crotchExt, 0),
    L(crotchExt + waistQ, 0),
    C(crotchExt + waistQ + 5, hipDrop * 0.4, crotchExt + hipQ, hipDrop * 0.8, crotchExt + hipQ, hipDrop),
    L(crotchExt + kneeW, totalL * 0.6),
    L(crotchExt + hemW, totalL),
    L(crotchExt - hemW * 0.15, totalL),
    L(crotchExt - kneeW * 0.1, totalL * 0.6),
    C(-5, hipDrop + 30, -5, hipDrop * 0.4, crotchExt, 0),
    Z(),
  ];

  return {
    id: uid(),
    name: 'Back Pants',
    outline,
    internals: [grainline(crotchExt + waistQ / 2, 40, totalL - 40)],
    position: { x: 50 + hipQ + 80, y: 50 },
    rotation: 0,
    mirrored: false,
    seamAllowance: 10,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ═══════════════════════════════════════════════════════
// COLLAR — basic shirt collar
// ═══════════════════════════════════════════════════════

export function generateCollar(m: BodyMeasurements, standH = 3, collarH = 5): PatternPiece {
  const d = deriveMeasurements(m);
  const halfNeck = mm(d.neckCirc) / 2 + 10;
  const standHmm = mm(standH);
  const collarHmm = mm(collarH);

  const outline: PathCommand[] = [
    M(0, standHmm),
    // Stand
    C(0, standHmm * 0.3, halfNeck * 0.3, 0, halfNeck, 0),
    // Collar fall
    L(halfNeck + 15, -collarHmm * 0.3),
    C(halfNeck + 20, -collarHmm, halfNeck * 0.6, -collarHmm, halfNeck * 0.5, -collarHmm * 0.7),
    L(0, standHmm),
    Z(),
  ];

  return {
    id: uid(),
    name: 'Collar',
    outline,
    internals: [grainline(halfNeck / 2, 5, standHmm - 5)],
    position: { x: 50, y: 50 },
    rotation: 0,
    mirrored: false,
    seamAllowance: 7,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ═══════════════════════════════════════════════════════
// TEMPLATE REGISTRY
// ═══════════════════════════════════════════════════════

export interface PatternTemplate {
  id: string;
  name: string;
  nameEs: string;
  description: string;
  descriptionEs: string;
  icon: string;
  generate: (measurements: BodyMeasurements) => PatternPiece[];
}

export const PATTERN_TEMPLATES: PatternTemplate[] = [
  {
    id: 'bodice-block',
    name: 'Bodice Block',
    nameEs: 'Bloque de Corpiño',
    description: 'Front + back bodice with bust dart and armhole',
    descriptionEs: 'Corpiño delantero + trasero con pinza de busto y sisa',
    icon: '👚',
    generate: (m) => [generateBodiceBack(m), generateBodiceFront(m)],
  },
  {
    id: 'sleeve-block',
    name: 'Sleeve',
    nameEs: 'Manga',
    description: 'Set-in sleeve with cap',
    descriptionEs: 'Manga montada con copete',
    icon: '🦾',
    generate: (m) => [generateSleeve(m)],
  },
  {
    id: 'skirt-a-line',
    name: 'A-Line Skirt',
    nameEs: 'Falda Línea A',
    description: 'Front + back A-line skirt with waist darts',
    descriptionEs: 'Falda línea A con pinzas de cintura',
    icon: '👗',
    generate: (m) => [generateSkirtFront(m), generateSkirtBack(m)],
  },
  {
    id: 'pants-basic',
    name: 'Basic Trousers',
    nameEs: 'Pantalón Básico',
    description: 'Front + back trouser block',
    descriptionEs: 'Bloque de pantalón delantero + trasero',
    icon: '👖',
    generate: (m) => [generatePantsFront(m), generatePantsBack(m)],
  },
  {
    id: 'collar-shirt',
    name: 'Shirt Collar',
    nameEs: 'Cuello de Camisa',
    description: 'Stand collar with fall',
    descriptionEs: 'Cuello con pie y caída',
    icon: '👔',
    generate: (m) => [generateCollar(m)],
  },
];
