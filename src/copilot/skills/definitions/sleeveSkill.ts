/**
 * Sleeve / Manga Skill — drafting knowledge for sleeve blocks.
 *
 * Covers set-in sleeve, two-piece tailored sleeve, and raglan construction
 * with cap height calculation, ease distribution, and elbow dart placement.
 *
 * @module skills/definitions/sleeveSkill
 */

import type { PatternSkill } from '../types';

/** Sleeve pattern skill definition */
export const sleeveSkill: PatternSkill = {
  name: 'sleeve',
  triggers: [
    // English
    'sleeve', 'set-in sleeve', 'raglan', 'two-piece sleeve',
    'sleeve cap', 'sleeve block',
    // Spanish
    'manga', 'manga pegada', 'manga ranglan', 'manga sastre',
    'cabeza de manga', 'manga base',
  ],
  description:
    'Sleeve/Manga drafting — set-in, two-piece tailored, and raglan sleeve ' +
    'construction from armhole measurements with cap ease and elbow shaping.',
  methods: [
    {
      name: 'Standard set-in',
      origin: 'UK',
      description:
        'Standard one-piece set-in sleeve. Cap height derived from armhole depth, ' +
        'cap width from armhole measurement. Default for most garments.',
      formulas: {
        capHeight: '(armholeDepth / 2) - 1',
        sleeveWidth: 'upperArmCirc + 4',
        capWidth: 'armholeMeasurement / 2',
        elbowLine: 'armLength * 0.6',
        capEase: '2.5',
      },
    },
    {
      name: 'Two-piece tailored',
      origin: 'UK',
      description:
        'Two-piece sleeve for tailored jackets and coats. Upper and under-sleeve ' +
        'with front and back seams for better fit around the arm bend.',
      formulas: {
        capHeight: '(armholeDepth / 2) - 0.5',
        sleeveWidth: 'upperArmCirc + 6',
        capWidth: 'armholeMeasurement / 2',
        elbowLine: 'armLength * 0.6',
        capEase: '3',
        underSleeveWidth: '(upperArmCirc + 6) * 0.45',
        upperSleeveWidth: '(upperArmCirc + 6) * 0.55',
      },
    },
    {
      name: 'Raglan',
      origin: 'UK',
      description:
        'Raglan sleeve runs from neckline to wrist. The sleeve cap includes ' +
        'part of the shoulder, taken from the front and back bodice.',
      formulas: {
        capHeight: 'shoulderSlope + armholeDepth',
        sleeveWidth: 'upperArmCirc + 4',
        raglanAngle: '45',
        elbowLine: 'armLength * 0.6',
        capEase: '1.5',
      },
    },
  ],
  formulas: {
    capHeight: {
      name: 'Cap height / Altura de cabeza de manga',
      expression: '(armholeDepth / 2) - 1',
      description: 'Half armhole depth minus 1cm for standard set-in sleeves.',
      variables: ['armscyeDepth'],
      unit: 'cm',
    },
    sleeveWidth: {
      name: 'Sleeve width / Ancho de manga',
      expression: 'upperArmCirc + 4',
      description: 'Upper arm circumference plus 4cm ease for comfortable movement.',
      variables: ['upperArmCirc'],
      unit: 'cm',
    },
    capWidth: {
      name: 'Cap width / Ancho de cabeza',
      expression: 'armholeMeasurement / 2',
      description: 'Half the total armhole measurement for the cap spread.',
      variables: [],
      unit: 'cm',
    },
    elbowLine: {
      name: 'Elbow line position / Posición de línea de codo',
      expression: 'armLength * 0.6',
      description: '60% of total arm length from cap to elbow.',
      variables: ['armLength'],
      unit: 'cm',
    },
    capEase: {
      name: 'Cap ease / Embebido de cabeza',
      expression: '2.5',
      description: 'Extra length in the sleeve cap for easing into armhole (woven default).',
      variables: [],
      unit: 'cm',
    },
    wristWidth: {
      name: 'Wrist width / Ancho de puño',
      expression: 'wristCirc + 2',
      description: 'Wrist circumference plus 2cm ease.',
      variables: ['wristCirc'],
      unit: 'cm',
    },
  },
  easeTable: {
    woven: {
      upperArmCirc: 4,
      capEase: 3,
      wristCirc: 2,
    },
    stretch: {
      upperArmCirc: 2,
      capEase: 1.5,
      wristCirc: 1,
    },
    jersey: {
      upperArmCirc: 0,
      capEase: 1,
      wristCirc: 0,
    },
    outerwear: {
      upperArmCirc: 8,
      capEase: 3,
      wristCirc: 3,
    },
  },
  constructionSteps: [
    {
      order: 1,
      instruction: 'Measure the armhole from the bodice pieces (front + back armhole edges). / Medir la sisa de las piezas del corpiño (bordes de sisa delantero + espalda).',
      toolCalls: ['getMeasurements'],
      validation: 'Armhole measurement is taken from actual bodice pieces.',
    },
    {
      order: 2,
      instruction: 'Draw vertical center line (sleeve length from shoulder to wrist). / Trazar línea central vertical (largo de manga desde hombro hasta muñeca).',
      toolCalls: ['createPiece'],
    },
    {
      order: 3,
      instruction: 'Mark cap height: armholeDepth/2 - 1cm from top. / Marcar altura de cabeza: profundidad de sisa/2 - 1cm desde arriba.',
      toolCalls: [],
    },
    {
      order: 4,
      instruction: 'Draw sleeve width at bicep line: upperArm + 4cm ease. / Trazar ancho de manga en línea de bíceps: brazo superior + 4cm de holgura.',
      toolCalls: ['modifyOutline'],
    },
    {
      order: 5,
      instruction: 'Shape the sleeve cap curve using 3-point bezier. Front cap slightly concave, back cap rounder. / Dar forma a la curva de cabeza de manga con bezier de 3 puntos. Cabeza delantera ligeramente cóncava, trasera más redondeada.',
      toolCalls: ['modifyOutline'],
      validation: 'Cap curve length equals armhole + ease (2.5cm woven).',
    },
    {
      order: 6,
      instruction: 'Mark elbow line at 60% of arm length from cap. / Marcar línea de codo al 60% del largo de manga desde la cabeza.',
      toolCalls: [],
    },
    {
      order: 7,
      instruction: 'Taper from bicep to wrist width (wristCirc + 2cm). / Reducir desde el bíceps hasta el ancho de muñeca (circunferencia de muñeca + 2cm).',
      toolCalls: ['modifyOutline'],
    },
    {
      order: 8,
      instruction: 'Add elbow dart if fitted sleeve: 1-2cm intake at elbow level. / Agregar pinza de codo si la manga es ajustada: 1-2cm de absorción a nivel del codo.',
      toolCalls: ['addDart'],
      validation: 'Elbow dart points toward center of arm.',
    },
    {
      order: 9,
      instruction: 'Add grainline (vertical, center of sleeve). / Agregar línea de hilo (vertical, centro de manga).',
      toolCalls: ['addGrainline'],
    },
    {
      order: 10,
      instruction: 'Add notches: 1 notch at front armhole, 2 notches at back armhole, 1 at cap center. / Agregar piquetes: 1 piquete en sisa delantera, 2 piquetes en sisa trasera, 1 en centro de cabeza.',
      toolCalls: ['addNotch'],
      validation: 'Front notch (single), back notch (double), center cap (single).',
    },
  ],
  gradeRules: [
    { point: 'cap-center', measurement: 'shoulder', deltaX: 0.15, deltaY: -0.05 },
    { point: 'bicep-front', measurement: 'upperArmCirc', deltaX: -0.2, deltaY: 0 },
    { point: 'bicep-back', measurement: 'upperArmCirc', deltaX: 0.2, deltaY: 0 },
    { point: 'elbow-front', measurement: 'upperArmCirc', deltaX: -0.15, deltaY: 0 },
    { point: 'elbow-back', measurement: 'upperArmCirc', deltaX: 0.15, deltaY: 0 },
    { point: 'wrist-front', measurement: 'wristCirc', deltaX: -0.1, deltaY: 0 },
    { point: 'wrist-back', measurement: 'wristCirc', deltaX: 0.1, deltaY: 0 },
    { point: 'hem-center', measurement: 'armLength', deltaX: 0, deltaY: 0.25 },
  ],
};
