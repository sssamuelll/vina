/**
 * Collar / Cuello Skill — drafting knowledge for collar types.
 *
 * Covers stand (mandarin), flat (Peter Pan), shirt collar, revere/lapel,
 * and shawl collar construction from neckline measurements.
 *
 * @module skills/definitions/collarSkill
 */

import type { PatternSkill } from '../types';

/** Collar pattern skill definition */
export const collarSkill: PatternSkill = {
  name: 'collar',
  triggers: [
    // English
    'collar', 'stand collar', 'peter pan', 'mandarin', 'lapel',
    'shirt collar', 'shawl collar', 'revere',
    // Spanish
    'cuello', 'cuello camisero', 'cuello mao', 'solapa',
    'cuello peter pan', 'cuello esmoquin', 'cuello base',
  ],
  description:
    'Collar/Cuello types — stand (mandarin), flat (Peter Pan), shirt collar, ' +
    'revere/lapel, and shawl collar construction from neckline extraction.',
  methods: [
    {
      name: 'Stand (Mandarin)',
      origin: 'CN',
      description:
        'Upright band collar that follows the neck. Simple rectangular construction ' +
        'with slight curve on the upper edge.',
      formulas: {
        collarLength: 'necklineMeasurement + 2',
        standHeight: '3.5',
        curvature: '0.5',
      },
    },
    {
      name: 'Flat (Peter Pan)',
      origin: 'UK',
      description:
        'Flat collar that lies on the shoulders. Drafted by tracing shoulder/neckline ' +
        'from bodice front and back pieces.',
      formulas: {
        collarWidth: '7',
        necklineLength: 'frontNeck + backNeck',
        standHeight: '0',
      },
    },
    {
      name: 'Shirt collar (Cuello camisero)',
      origin: 'UK',
      description:
        'Two-part collar: a stand (band) and a fall (upper collar). ' +
        'Classic for dress shirts and blouses.',
      formulas: {
        standHeight: '3',
        collarWidth: '7',
        collarLength: 'necklineMeasurement + 2',
        rollLine: 'standHeight * 0.6',
        buttonStandExtension: '2',
      },
    },
    {
      name: 'Revere / Lapel',
      origin: 'UK',
      description:
        'Tailored collar that folds back on the front bodice, creating a lapel. ' +
        'Requires precise roll line placement and gorge line shaping.',
      formulas: {
        lapelWidth: '8',
        collarWidth: '7',
        gorgeDepth: '2',
        rollLineAngle: '30',
        breakPoint: 'bustLine',
      },
    },
    {
      name: 'Shawl',
      origin: 'UK',
      description:
        'Continuous collar-lapel with no seam at the gorge. ' +
        'Used for tuxedos, robes, and casual jackets.',
      formulas: {
        collarWidth: '8',
        rollLineAngle: '25',
        necklineLength: 'backNeck + frontNeck',
      },
    },
  ],
  formulas: {
    standHeight: {
      name: 'Stand height / Altura de pie de cuello',
      expression: '3.5',
      description: 'Height of the collar stand (band). 3-4cm standard, 0 for flat collars.',
      variables: [],
      unit: 'cm',
    },
    collarWidth: {
      name: 'Collar width / Ancho de cuello',
      expression: '7',
      description: 'Width of the collar fall. 6-8cm for shirt, 3cm for stand, variable for lapel.',
      variables: [],
      unit: 'cm',
    },
    necklineMeasurement: {
      name: 'Neckline measurement / Medida de escote',
      expression: 'frontNeckLength + backNeckLength',
      description: 'Total neckline length extracted from front and back bodice pieces.',
      variables: ['neckCirc'],
      unit: 'cm',
    },
    rollLinePosition: {
      name: 'Roll line / Línea de quiebre',
      expression: 'standHeight * 0.6',
      description: 'Position where the collar folds over. Approximately 60% up the stand.',
      variables: [],
      unit: 'cm',
    },
    buttonStandExtension: {
      name: 'Button stand / Solapa de botonadura',
      expression: '2',
      description: 'Extension beyond center front for button closure. Standard 2cm.',
      variables: [],
      unit: 'cm',
    },
    collarLength: {
      name: 'Collar length / Largo de cuello',
      expression: 'necklineMeasurement + 2',
      description: 'Total collar length with 2cm overlap for closure.',
      variables: ['neckCirc'],
      unit: 'cm',
    },
  },
  easeTable: {
    woven: {
      neckCirc: 1,
      standHeight: 0,
    },
    stretch: {
      neckCirc: 0,
      standHeight: 0,
    },
    jersey: {
      neckCirc: -0.5,
      standHeight: 0,
    },
    outerwear: {
      neckCirc: 2,
      standHeight: 0.5,
    },
  },
  constructionSteps: [
    {
      order: 1,
      instruction: 'Extract neckline measurement from bodice front and back pieces. / Extraer medida del escote de las piezas de corpiño delantero y espalda.',
      toolCalls: ['getMeasurements'],
      validation: 'Neckline measurement is taken from actual bodice neckline edges.',
    },
    {
      order: 2,
      instruction: 'For stand collar: draw rectangle width = neckline + 2cm, height = stand height (3-4cm). / Para cuello mao: trazar rectángulo ancho = escote + 2cm, alto = altura de pie (3-4cm).',
      toolCalls: ['createPiece'],
    },
    {
      order: 3,
      instruction: 'Curve the upper edge slightly (0.5cm convex) for fit around neck. / Curvar ligeramente el borde superior (0.5cm convexo) para ajuste alrededor del cuello.',
      toolCalls: ['modifyOutline'],
    },
    {
      order: 4,
      instruction: 'For shirt collar: draft stand piece first, then collar fall on top. Stand height = 3cm, fall width = 7cm. / Para cuello camisero: trazar pie de cuello primero, luego caída del cuello encima. Pie = 3cm, caída = 7cm.',
      toolCalls: ['createPiece'],
    },
    {
      order: 5,
      instruction: 'Mark roll line at 60% of stand height from the neckline seam. / Marcar línea de quiebre al 60% de la altura del pie desde la costura del escote.',
      toolCalls: ['addFoldLine'],
    },
    {
      order: 6,
      instruction: 'Shape collar points (spread, button-down, cutaway) as desired. / Dar forma a las puntas del cuello (clásico, button-down, italiano) según lo deseado.',
      toolCalls: ['modifyOutline'],
    },
    {
      order: 7,
      instruction: 'Add grainline: horizontal for stand, on-bias for flat collars. / Agregar línea de hilo: horizontal para pie de cuello, al bies para cuellos planos.',
      toolCalls: ['addGrainline'],
    },
    {
      order: 8,
      instruction: 'Add notches at center back and front overlap points. Set SA = 7mm. / Agregar piquetes en centro espalda y puntos de solape delantero. Margen = 7mm.',
      toolCalls: ['addNotch', 'setSeamAllowance'],
      validation: 'Center back notch present, SA is 7mm (neckline standard).',
    },
  ],
  gradeRules: [
    { point: 'collar-end-left', measurement: 'neckCirc', deltaX: -0.08, deltaY: 0 },
    { point: 'collar-end-right', measurement: 'neckCirc', deltaX: 0.08, deltaY: 0 },
    { point: 'center-back-top', measurement: 'neckCirc', deltaX: 0, deltaY: -0.03 },
    { point: 'center-back-bottom', measurement: 'neckCirc', deltaX: 0, deltaY: 0.03 },
  ],
};
