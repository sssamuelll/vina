/**
 * Skirt / Falda Skill — construction knowledge for skirt blocks.
 *
 * Covers straight, A-line, flared, circle, pencil, and godet skirt
 * construction with dart placement, hip curve, and hem shaping.
 *
 * @module skills/definitions/skirtSkill
 */

import type { PatternSkill } from '../types';

/** Skirt pattern skill definition */
export const skirtSkill: PatternSkill = {
  name: 'skirt',
  triggers: [
    // English
    'skirt', 'straight skirt', 'a-line', 'circle skirt', 'pencil skirt',
    'flared skirt', 'godet', 'skirt block',
    // Spanish
    'falda', 'falda recta', 'evasé', 'evase', 'falda circular',
    'falda lápiz', 'falda lapiz', 'godets', 'falda base', 'falda evasé',
  ],
  description:
    'Skirt/Falda construction — straight, A-line, flared, circle, pencil, ' +
    'and godet skirts from waist and hip measurements.',
  methods: [
    {
      name: 'Straight skirt block',
      origin: 'UK',
      description:
        'Standard straight skirt block. Quarter panels with front and back ' +
        'darts. Foundation for all skirt variations.',
      formulas: {
        waistPanelFront: '(waist / 4) + frontDartIntake',
        waistPanelBack: '(waist / 4) + backDartIntake',
        hipPanel: 'hips / 4',
        frontDartIntake: '((hips - waist) / 4) * 0.6',
        backDartIntake: '((hips - waist) / 4) * 0.4',
        hipLine: '20',
        skirtLength: 'waistToKnee',
      },
    },
    {
      name: 'A-line flare',
      origin: 'UK',
      description:
        'A-line transformation — adds 3-5cm flare per panel at the hem, ' +
        'with proportional reduction of dart intake.',
      formulas: {
        hemFlarePerPanel: '4',
        waistPanelFront: '(waist / 4) + frontDartIntake',
        hipPanel: 'hips / 4',
        frontDartIntake: '((hips - waist) / 4) * 0.4',
        backDartIntake: '((hips - waist) / 4) * 0.3',
      },
    },
    {
      name: 'Circle skirt',
      origin: 'UK',
      description:
        'Full circle skirt — waist opening as a circle with radius = waist / (2π). ' +
        'No darts needed. Cut on bias for drape.',
      formulas: {
        waistRadius: 'waist / (2 * 3.14159)',
        hemRadius: '(waist / (2 * 3.14159)) + skirtLength',
        halfCircleRadius: 'waist / 3.14159',
        quarterCircleRadius: '(waist * 2) / 3.14159',
      },
    },
  ],
  formulas: {
    waistPanel: {
      name: 'Waist panel / Panel de cintura',
      expression: '(waist / 4) + dartIntake',
      description: 'Quarter waist plus dart intake for each panel.',
      variables: ['waist'],
      unit: 'cm',
    },
    hipPanel: {
      name: 'Hip panel / Panel de cadera',
      expression: 'hips / 4',
      description: 'Quarter hip for each panel width at hip level.',
      variables: ['hips'],
      unit: 'cm',
    },
    dartIntakeFront: {
      name: 'Front dart intake / Absorción pinza delantero',
      expression: '((hips - waist) / 4) * 0.6',
      description: '60% of quarter hip-waist difference for front dart.',
      variables: ['hips', 'waist'],
      unit: 'cm',
    },
    dartIntakeBack: {
      name: 'Back dart intake / Absorción pinza espalda',
      expression: '((hips - waist) / 4) * 0.4',
      description: '40% of quarter hip-waist difference for back dart.',
      variables: ['hips', 'waist'],
      unit: 'cm',
    },
    circleSkirtRadius: {
      name: 'Circle skirt radius / Radio de falda circular',
      expression: 'waist / (2 * Math.PI)',
      description: 'Waist circumference divided by 2π gives the waist opening radius.',
      variables: ['waist'],
      unit: 'cm',
    },
    aLineFlare: {
      name: 'A-line flare / Vuelo evasé',
      expression: '4',
      description: 'Standard 3-5cm flare per panel added at hem, subtracted from darts.',
      variables: [],
      unit: 'cm',
    },
    hipLine: {
      name: 'Hip line position / Posición línea de cadera',
      expression: '20',
      description: 'Standard hip line at 20cm below waist.',
      variables: [],
      unit: 'cm',
    },
  },
  easeTable: {
    woven: {
      waist: 1,
      hips: 2,
    },
    stretch: {
      waist: 0,
      hips: 0,
    },
    jersey: {
      waist: 0,
      hips: -2,
    },
    outerwear: {
      waist: 2,
      hips: 4,
    },
  },
  constructionSteps: [
    {
      order: 1,
      instruction: 'Draw back panel rectangle: width = hips/4, height = skirt length. / Trazar rectángulo de panel trasero: ancho = cadera/4, alto = largo de falda.',
      toolCalls: ['createPiece'],
    },
    {
      order: 2,
      instruction: 'Mark hip line at 20cm from waist. / Marcar línea de cadera a 20cm de la cintura.',
      toolCalls: [],
    },
    {
      order: 3,
      instruction: 'Shape waistline: reduce to waist/4 at top edge. / Dar forma a la cintura: reducir a cintura/4 en el borde superior.',
      toolCalls: ['modifyOutline'],
    },
    {
      order: 4,
      instruction: 'Draw hip curve from waist to hip line on side seam. / Trazar curva de cadera desde la cintura hasta la línea de cadera en la costura lateral.',
      toolCalls: ['modifyOutline'],
    },
    {
      order: 5,
      instruction: 'Add back dart(s): intake = ((hips-waist)/4) × 0.4, length = 14-15cm. Position at center of back panel. / Agregar pinza(s) trasera(s): absorción = ((cadera-cintura)/4) × 0.4, largo = 14-15cm. Posicionar en el centro del panel trasero.',
      toolCalls: ['addDart'],
      validation: 'Back dart intake matches formula, length 14-15cm.',
    },
    {
      order: 6,
      instruction: 'Create front panel: same base rectangle, different dart placement. / Crear panel delantero: mismo rectángulo base, diferente colocación de pinza.',
      toolCalls: ['createPiece'],
    },
    {
      order: 7,
      instruction: 'Add front dart(s): intake = ((hips-waist)/4) × 0.6, length = 10-11cm. Position at bust point projection. / Agregar pinza(s) delantera(s): absorción = ((cadera-cintura)/4) × 0.6, largo = 10-11cm. Posicionar en la proyección del punto de pecho.',
      toolCalls: ['addDart'],
      validation: 'Front dart intake matches formula, length 10-11cm (shorter than back).',
    },
    {
      order: 8,
      instruction: 'Add grainlines: vertical at center front and center back. / Agregar líneas de hilo: verticales en centro delantero y centro espalda.',
      toolCalls: ['addGrainline'],
    },
    {
      order: 9,
      instruction: 'Add notches at side seam hip level and waist. / Agregar piquetes en la costura lateral a nivel de cadera y cintura.',
      toolCalls: ['addNotch'],
    },
    {
      order: 10,
      instruction: 'Set seam allowance: 10mm side/waist seams, 30mm hem allowance. / Establecer margen de costura: 10mm costuras laterales/cintura, 30mm dobladillo.',
      toolCalls: ['setSeamAllowance'],
    },
  ],
  gradeRules: [
    { point: 'side-waist', measurement: 'waist', deltaX: 0.25, deltaY: 0 },
    { point: 'side-hip', measurement: 'hips', deltaX: 0.25, deltaY: 0 },
    { point: 'side-hem', measurement: 'hips', deltaX: 0.25, deltaY: 0 },
    { point: 'center-waist', measurement: 'waist', deltaX: 0, deltaY: 0 },
    { point: 'center-hem', measurement: 'hips', deltaX: 0, deltaY: 0.25 },
    { point: 'dart-center', measurement: 'waist', deltaX: 0.125, deltaY: 0 },
  ],
};
