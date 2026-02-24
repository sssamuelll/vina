/**
 * Bodice Back Block — Aldrich method (simplified)
 */

import type { Blueprint } from '../../../types/blueprint';

export const bodiceBackBlock: Blueprint = {
  id: 'aldrich-bodice-back',
  name: 'Bodice Back Block (Aldrich)',
  nameEs: 'Bloque Base Espalda (Aldrich)',
  description: 'Back bodice block/sloper using the Aldrich method.',
  descriptionEs: 'Bloque base espalda usando el método Aldrich.',
  category: 'blocks',
  method: 'Aldrich',
  requiredMeasurements: ['chest', 'waist', 'height'],
  variables: {
    ease: { label: 'Ease', labelEs: 'Holgura', default: 10, description: 'Ease at chest in mm' },
    neckCirc: { label: 'Neck Circumference', default: 'chest*0.36' },
    backLength: { label: 'Back Length', default: 'height*0.25' },
    armholeDepth: { label: 'Armhole Depth', default: 'height*0.12+50' },
    shoulderLength: { label: 'Shoulder Length', default: 'shoulder/2' },
  },
  steps: [
    {
      tool: 'addConstructionPoint', label: 'A', type: 'absolute', x: 0, y: 0,
      comment: 'Origin — center back neck',
    },
    {
      tool: 'addConstructionPoint', label: 'B', type: 'endLine',
      basePoint: 'A', angle: 0, length: 'chest/4+ease',
      comment: 'Chest width',
    },
    {
      tool: 'addConstructionPoint', label: 'C', type: 'endLine',
      basePoint: 'A', angle: 270, length: 'backLength',
      comment: 'Waist center back',
    },
    {
      tool: 'addConstructionPoint', label: 'D', type: 'intersectionXY',
      xFrom: 'B', yFrom: 'C',
      comment: 'Waist side',
    },
    {
      tool: 'addConstructionPoint', label: 'E', type: 'endLine',
      basePoint: 'A', angle: 270, length: 'armholeDepth',
      comment: 'Armhole depth',
    },
    {
      tool: 'addConstructionPoint', label: 'F', type: 'intersectionXY',
      xFrom: 'B', yFrom: 'E',
      comment: 'Armhole side',
    },
    {
      tool: 'addConstructionPoint', label: 'neckWidth', type: 'endLine',
      basePoint: 'A', angle: 0, length: 'neckCirc/6+5',
      comment: 'Back neck width — same as front',
    },
    {
      tool: 'addConstructionPoint', label: 'neckDepth', type: 'endLine',
      basePoint: 'A', angle: 270, length: 20,
      comment: 'Back neck depth — shallow (20mm)',
      commentEs: 'Profundidad cuello espalda — poco profundo (20mm)',
    },
    {
      tool: 'addConstructionPoint', label: 'shoulder', type: 'endLine',
      basePoint: 'neckWidth', angle: 255, length: 'shoulderLength',
      comment: 'Shoulder tip',
    },
    // Curves
    {
      tool: 'addConstructionCurve', label: 'neckCurve',
      from: 'neckDepth', to: 'neckWidth',
      angle1: 0, angle2: 270,
      length1: 'neckCirc/8', length2: 'neckCirc/10',
      comment: 'Back neckline — flatter curve than front',
    },
    {
      tool: 'addConstructionCurve', label: 'armholeCurve',
      from: 'shoulder', to: 'F',
      angle1: 260, angle2: 180,
      length1: 'armholeDepth*0.35', length2: 'armholeDepth*0.25',
      comment: 'Back armhole — slightly less curved than front',
    },
    // Build piece
    {
      tool: 'buildPieceFromConstruction',
      name: 'Espalda / Back Bodice',
      points: ['neckDepth', 'neckWidth', 'shoulder', 'F', 'D', 'C'],
      curves: ['neckCurve', null, 'armholeCurve', null, null, null],
      seamAllowance: 10,
    },
  ],
  source: 'builtin',
  tags: ['bodice', 'corpiño', 'back', 'espalda', 'block', 'sloper', 'aldrich', 'tshirt', 't-shirt', 'camiseta', 'shirt', 'camisa', 'blouse', 'blusa', 'top'],
  version: 1,
  createdAt: 0,
  updatedAt: 0,
};
