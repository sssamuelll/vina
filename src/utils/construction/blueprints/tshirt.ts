/**
 * Basic T-shirt Blueprint — Aldrich method
 * 
 * Complete garment: Front Body + Back Body + Sleeve
 * Based on "Metric Pattern Cutting for Women's Wear" by Winifred Aldrich.
 * 
 * Key difference from a base block: this is a FINISHED GARMENT pattern.
 * - Length extends to hip (not waist)
 * - Side seam has waist shaping (subtle for a t-shirt)
 * - Hem is shaped
 * 
 * Coordinate system: 1 unit = 1mm, X→right, Y→down
 * Angles: 0=right, 90=up, 180=left, 270=down (Y inverted via sin)
 */

import type { Blueprint } from '../../../types/blueprint';

export const basicTshirt: Blueprint = {
  id: 'basic-tshirt',
  name: 'Basic T-shirt',
  nameEs: 'Camiseta Básica',
  description: 'Complete basic t-shirt pattern: front body, back body, and short sleeve. Aldrich method with hip-length hem and side shaping.',
  descriptionEs: 'Patrón completo de camiseta básica: delantero, espalda y manga corta. Método Aldrich con largo a cadera y entalle lateral.',
  category: 'tops',
  requiredMeasurements: ['chest', 'waist', 'height', 'shoulder', 'armLength', 'hips'],
  variables: {
    ease: { label: 'Ease', labelEs: 'Holgura', default: 50, description: 'Ease at chest in mm (5cm for t-shirt)' },
    neckWidth: { label: 'Neck Width', labelEs: 'Ancho Cuello', default: 'chest/10+20', description: 'Half neck opening' },
    neckDepthFront: { label: 'Front Neck Depth', default: 'chest/10+30', description: 'Front neck drop' },
    neckDepthBack: { label: 'Back Neck Depth', default: 20, description: 'Back neck drop (shallow)' },
    armholeDepth: { label: 'Armhole Depth', labelEs: 'Profundidad Sisa', default: 'height*0.12+60', description: 'Depth of armhole from shoulder' },
    shoulderSeam: { label: 'Shoulder Seam', labelEs: 'Costura Hombro', default: 'shoulder/2-neckWidth', description: 'Shoulder seam length' },
    // T-shirt length: to mid-hip, not waist
    hemLength: { label: 'Garment Length', labelEs: 'Largo Prenda', default: 'height*0.38', description: 'Total length shoulder to hem (~68cm)' },
    waistLevel: { label: 'Waist Level', labelEs: 'Nivel Cintura', default: 'height*0.25', description: 'Waist position from shoulder' },
    // Side shaping: subtle for t-shirt (15mm each side = 3cm total waist reduction)
    sideIndent: { label: 'Side Indent', labelEs: 'Entalle Lateral', default: 15, description: 'Waist shaping per side in mm' },
    // Sleeve
    sleeveWidth: { label: 'Sleeve Width', labelEs: 'Ancho Manga', default: 'chest/4+30', description: 'Half sleeve circumference' },
    capHeight: { label: 'Cap Height', labelEs: 'Altura Copete', default: 'armholeDepth*0.45', description: 'Sleeve cap height' },
    sleeveLength: { label: 'Sleeve Length', labelEs: 'Largo Manga', default: 220, description: 'Short sleeve ~22cm' },
  },
  blocks: [
    // ─── Front Body Block ───────────────────────────────────────────────
    {
      id: 'front',
      name: 'Front Body',
      nameEs: 'Delantero',
      method: 'Aldrich',
      type: 'body',
      steps: [
        // Top-left origin (center front, shoulder level)
        { tool: 'addConstructionPoint', label: 'F_A', type: 'absolute', x: 0, y: 0,
          comment: 'Origin — center front at shoulder' },
        // Neckline
        { tool: 'addConstructionPoint', label: 'F_neckSide', type: 'endLine',
          basePoint: 'F_A', angle: 0, length: 'neckWidth',
          comment: 'Neck opening side point' },
        { tool: 'addConstructionPoint', label: 'F_neckBottom', type: 'endLine',
          basePoint: 'F_A', angle: 270, length: 'neckDepthFront',
          comment: 'Front neck depth — scoop' },
        // Shoulder
        { tool: 'addConstructionPoint', label: 'F_shoulder', type: 'endLine',
          basePoint: 'F_neckSide', angle: 345, length: 'shoulderSeam',
          comment: 'Shoulder tip — 15° drop' },
        // Armhole depth
        { tool: 'addConstructionPoint', label: 'F_sideTop', type: 'absolute',
          x: 'chest/4+ease', y: 'armholeDepth',
          comment: 'Side seam at armhole level' },
        // Side seam: waist shaping
        { tool: 'addConstructionPoint', label: 'F_waistSide', type: 'absolute',
          x: 'chest/4+ease-sideIndent', y: 'waistLevel',
          comment: 'Side seam at waist — indented for shaping' },
        // Hem level (hip)
        { tool: 'addConstructionPoint', label: 'F_hemSide', type: 'absolute',
          x: 'hips/4+ease', y: 'hemLength',
          comment: 'Side seam at hem — hip width' },
        { tool: 'addConstructionPoint', label: 'F_hemCenter', type: 'absolute',
          x: 0, y: 'hemLength',
          comment: 'Center front at hem' },
        // Curves
        { tool: 'addConstructionCurve', label: 'F_neckCurve',
          from: 'F_neckBottom', to: 'F_neckSide',
          angle1: 0, angle2: 90,
          length1: 'neckWidth*0.6', length2: 'neckDepthFront*0.5',
          comment: 'Front neckline scoop' },
        { tool: 'addConstructionCurve', label: 'F_armholeCurve',
          from: 'F_shoulder', to: 'F_sideTop',
          angle1: 280, angle2: 270,
          length1: 'armholeDepth*0.5', length2: 'armholeDepth*0.35',
          comment: 'Armhole curve' },
        // Side seam curve: sideTop → waistSide → hemSide (gentle S-curve)
        { tool: 'addConstructionCurve', label: 'F_sideCurve',
          from: 'F_sideTop', to: 'F_hemSide',
          angle1: 270, angle2: 270,
          length1: 80, length2: 80,
          comment: 'Side seam — gentle curve through waist' },
        // Piece outline
        { tool: 'buildPieceFromConstruction',
          name: 'Delantero / Front',
          points: ['F_neckBottom', 'F_neckSide', 'F_shoulder', 'F_sideTop', 'F_hemSide', 'F_hemCenter'],
          curves: ['F_neckCurve', null, 'F_armholeCurve', 'F_sideCurve', null, null],
          seamAllowance: 10 },
      ],
    },
    // ─── Back Body Block ────────────────────────────────────────────────
    {
      id: 'back',
      name: 'Back Body',
      nameEs: 'Espalda',
      method: 'Aldrich',
      type: 'body',
      steps: [
        { tool: 'addConstructionPoint', label: 'B_A', type: 'absolute', x: 0, y: 0,
          comment: 'Origin — center back at shoulder' },
        // Neckline — shallower than front
        { tool: 'addConstructionPoint', label: 'B_neckSide', type: 'endLine',
          basePoint: 'B_A', angle: 0, length: 'neckWidth',
          comment: 'Neck opening side' },
        { tool: 'addConstructionPoint', label: 'B_neckBottom', type: 'endLine',
          basePoint: 'B_A', angle: 270, length: 'neckDepthBack',
          comment: 'Back neck — shallow 20mm' },
        // Shoulder
        { tool: 'addConstructionPoint', label: 'B_shoulder', type: 'endLine',
          basePoint: 'B_neckSide', angle: 345, length: 'shoulderSeam',
          comment: 'Shoulder tip' },
        // Armhole
        { tool: 'addConstructionPoint', label: 'B_sideTop', type: 'absolute',
          x: 'chest/4+ease', y: 'armholeDepth',
          comment: 'Side seam at armhole level' },
        // Side seam shaping
        { tool: 'addConstructionPoint', label: 'B_waistSide', type: 'absolute',
          x: 'chest/4+ease-sideIndent', y: 'waistLevel',
          comment: 'Side seam at waist — indented' },
        // Hem
        { tool: 'addConstructionPoint', label: 'B_hemSide', type: 'absolute',
          x: 'hips/4+ease', y: 'hemLength',
          comment: 'Side seam at hem' },
        { tool: 'addConstructionPoint', label: 'B_hemCenter', type: 'absolute',
          x: 0, y: 'hemLength',
          comment: 'Center back at hem' },
        // Curves
        { tool: 'addConstructionCurve', label: 'B_neckCurve',
          from: 'B_neckBottom', to: 'B_neckSide',
          angle1: 0, angle2: 90,
          length1: 'neckWidth*0.5', length2: 'neckDepthBack*0.8',
          comment: 'Back neckline — flatter curve' },
        { tool: 'addConstructionCurve', label: 'B_armholeCurve',
          from: 'B_shoulder', to: 'B_sideTop',
          angle1: 280, angle2: 270,
          length1: 'armholeDepth*0.45', length2: 'armholeDepth*0.3',
          comment: 'Back armhole' },
        { tool: 'addConstructionCurve', label: 'B_sideCurve',
          from: 'B_sideTop', to: 'B_hemSide',
          angle1: 270, angle2: 270,
          length1: 80, length2: 80,
          comment: 'Side seam — gentle curve through waist' },
        // Piece
        { tool: 'buildPieceFromConstruction',
          name: 'Espalda / Back',
          points: ['B_neckBottom', 'B_neckSide', 'B_shoulder', 'B_sideTop', 'B_hemSide', 'B_hemCenter'],
          curves: ['B_neckCurve', null, 'B_armholeCurve', 'B_sideCurve', null, null],
          seamAllowance: 10 },
      ],
    },
    // ─── Sleeve Block ───────────────────────────────────────────────────
    {
      id: 'sleeve',
      name: 'Short Sleeve',
      nameEs: 'Manga Corta',
      method: 'Aldrich',
      type: 'sleeve',
      steps: [
        { tool: 'addConstructionPoint', label: 'S_capTop', type: 'absolute',
          x: 'sleeveWidth/2', y: 0,
          comment: 'Top of sleeve cap — center' },
        { tool: 'addConstructionPoint', label: 'S_capLeft', type: 'absolute',
          x: 0, y: 'capHeight',
          comment: 'Left underarm' },
        { tool: 'addConstructionPoint', label: 'S_capRight', type: 'absolute',
          x: 'sleeveWidth', y: 'capHeight',
          comment: 'Right underarm' },
        { tool: 'addConstructionPoint', label: 'S_hemLeft', type: 'endLine',
          basePoint: 'S_capLeft', angle: 270, length: 'sleeveLength',
          comment: 'Left hem' },
        { tool: 'addConstructionPoint', label: 'S_hemRight', type: 'endLine',
          basePoint: 'S_capRight', angle: 270, length: 'sleeveLength',
          comment: 'Right hem' },
        // Sleeve cap curves
        { tool: 'addConstructionCurve', label: 'S_capCurveL',
          from: 'S_capLeft', to: 'S_capTop',
          angle1: 80, angle2: 0,
          length1: 'capHeight*0.6', length2: 'capHeight*0.5',
          comment: 'Left sleeve cap' },
        { tool: 'addConstructionCurve', label: 'S_capCurveR',
          from: 'S_capTop', to: 'S_capRight',
          angle1: 0, angle2: 280,
          length1: 'capHeight*0.5', length2: 'capHeight*0.6',
          comment: 'Right sleeve cap — mirror of left' },
        // Piece
        { tool: 'buildPieceFromConstruction',
          name: 'Manga / Sleeve',
          points: ['S_capLeft', 'S_capTop', 'S_capRight', 'S_hemRight', 'S_hemLeft'],
          curves: ['S_capCurveL', 'S_capCurveR', null, null, null],
          seamAllowance: 10 },
      ],
    },
  ],
  source: 'builtin',
  tags: ['tshirt', 't-shirt', 'camiseta', 'shirt', 'camisa', 'top', 'basic', 'básica', 'aldrich'],
  version: 2,
  createdAt: 0,
  updatedAt: 0,
};
