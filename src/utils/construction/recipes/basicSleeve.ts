/**
 * Basic Sleeve Block — Aldrich method
 */

import type { Recipe } from '../../../types/recipe';

export const basicSleeve: Recipe = {
  id: 'aldrich-sleeve',
  name: 'Basic Sleeve Block (Aldrich)',
  nameEs: 'Manga Básica (Aldrich)',
  description: 'Set-in sleeve with cap. Short sleeve version — adapt length for long sleeve.',
  descriptionEs: 'Manga montada con copete. Versión manga corta.',
  category: 'sleeves',
  method: 'Aldrich',
  requiredMeasurements: ['chest', 'armLength', 'height'],
  variables: {
    armholeDepth: { label: 'Armhole Depth', default: 'height*0.12+50' },
    sleeveWidth: { label: 'Sleeve Width', default: 'chest/4*0.85' },
    capHeight: { label: 'Cap Height', default: 'armholeDepth*0.5' },
    sleeveLength: { label: 'Sleeve Length', default: 220, description: 'Short sleeve ~22cm' },
  },
  steps: [
    {
      tool: 'addConstructionPoint', label: 'capTop', type: 'absolute', x: 'sleeveWidth/2', y: 0,
      comment: 'Top of sleeve cap — center',
    },
    {
      tool: 'addConstructionPoint', label: 'capLeft', type: 'absolute', x: 0, y: 'capHeight',
      comment: 'Left underarm point',
    },
    {
      tool: 'addConstructionPoint', label: 'capRight', type: 'absolute', x: 'sleeveWidth', y: 'capHeight',
      comment: 'Right underarm point',
    },
    {
      tool: 'addConstructionPoint', label: 'hemLeft', type: 'endLine',
      basePoint: 'capLeft', angle: 270, length: 'sleeveLength',
      comment: 'Left hem point',
    },
    {
      tool: 'addConstructionPoint', label: 'hemRight', type: 'endLine',
      basePoint: 'capRight', angle: 270, length: 'sleeveLength',
      comment: 'Right hem point',
    },
    // Sleeve cap curves
    {
      tool: 'addConstructionCurve', label: 'capCurveLeft',
      from: 'capLeft', to: 'capTop',
      angle1: 80, angle2: 180,
      length1: 'capHeight*0.6', length2: 'capHeight*0.5',
      comment: 'Left sleeve cap curve — smooth bell shape',
    },
    {
      tool: 'addConstructionCurve', label: 'capCurveRight',
      from: 'capTop', to: 'capRight',
      angle1: 0, angle2: 100,
      length1: 'capHeight*0.5', length2: 'capHeight*0.6',
      comment: 'Right sleeve cap curve',
    },
    // Build piece
    {
      tool: 'buildPieceFromConstruction',
      name: 'Manga / Sleeve',
      points: ['capLeft', 'capTop', 'capRight', 'hemRight', 'hemLeft'],
      curves: ['capCurveLeft', 'capCurveRight', null, null, null],
      seamAllowance: 10,
    },
  ],
  source: 'builtin',
  tags: ['sleeve', 'manga', 'short', 'corta', 'set-in', 'montada', 'aldrich', 'tshirt', 't-shirt', 'camiseta', 'shirt', 'camisa', 'blouse', 'blusa'],
  version: 1,
  createdAt: 0,
  updatedAt: 0,
};
