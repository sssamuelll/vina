/**
 * Bodice / Corpiño Skill — construction knowledge for bodice blocks.
 *
 * Covers front and back bodice drafting with bust darts, waist darts,
 * shoulder slope, and neckline shaping. Supports Aldrich, Müller,
 * and Gilewska methods.
 *
 * @module skills/definitions/bodiceSkill
 */

import type { PatternSkill } from '../types';

/** Bodice pattern skill definition */
export const bodiceSkill: PatternSkill = {
  name: 'bodice',
  triggers: [
    // English
    'bodice', 'body block', 'torso', 'front bodice', 'back bodice',
    // Spanish
    'corpiño', 'corpino', 'blusa base', 'cuerpo', 'torso base',
    'delantero', 'espalda', 'cuerpo base',
  ],
  description:
    'Bodice/Corpiño block construction — drafting front and back bodice pieces ' +
    'from body measurements with darts, shoulder slope, and neckline shaping.',
  methods: [
    {
      name: 'Aldrich',
      origin: 'UK',
      description:
        'Winifred Aldrich method — systematic block construction using chest, ' +
        'waist, and bust measurements with standard ease distribution.',
      formulas: {
        backWidth: '(chest / 4) + 1',
        frontWidth: '(chest / 4) + 1 + bustDartIntake',
        armholeDepth: '(height * 0.12) + 5',
        shoulderSlope: '2',
        backNeckWidth: '(neckCirc / 6) + 0.5',
        frontNeckDepth: '(neckCirc / 6) + 1.5',
        bustDartWidth: '(bust - chest) / 2',
        waistDartFront: '((chest - waist) / 4) * 0.6',
        waistDartBack: '((chest - waist) / 4) * 0.4',
      },
    },
    {
      name: 'Müller',
      origin: 'DE',
      description:
        'Müller & Sohn method — German precision drafting with detailed ' +
        'proportional calculations and separate front/back construction.',
      formulas: {
        backWidth: '(chest / 4) + 0.5',
        frontWidth: '(chest / 4) + 1.5 + bustDartIntake',
        armholeDepth: 'armscyeDepth + 2',
        shoulderSlope: '2.5',
        backNeckWidth: '(neckCirc / 6) + 0.5',
        frontNeckDepth: '(neckCirc / 6) + 2',
        bustDartWidth: '(bust - chest) / 2',
        waistDartFront: '((chest - waist) / 4) * 0.55',
        waistDartBack: '((chest - waist) / 4) * 0.45',
      },
    },
    {
      name: 'Gilewska',
      origin: 'FR',
      description:
        'Teresa Gilewska method — French approach with emphasis on ' +
        'balance lines and proportional bust dart construction.',
      formulas: {
        backWidth: '(chest / 4) + 1',
        frontWidth: '(chest / 4) + 1 + bustDartIntake',
        armholeDepth: '(neckToWaistBack / 2) + 1',
        shoulderSlope: '1.5',
        backNeckWidth: '(neckCirc / 6) + 0.5',
        frontNeckDepth: '(neckCirc / 6) + 1.5',
        bustDartWidth: '(bust - chest) / 2',
        waistDartFront: '((chest - waist) / 4) * 0.6',
        waistDartBack: '((chest - waist) / 4) * 0.4',
      },
    },
  ],
  formulas: {
    backWidth: {
      name: 'Back width / Ancho de espalda',
      expression: '(chest / 4) + 1',
      description: 'Quarter chest plus 1cm ease for the back panel.',
      variables: ['chest'],
      unit: 'cm',
    },
    frontWidth: {
      name: 'Front width / Ancho de delantero',
      expression: '(chest / 4) + 1 + bustDartIntake',
      description: 'Quarter chest plus ease plus bust dart intake for the front panel.',
      variables: ['chest'],
      unit: 'cm',
    },
    armholeDepth: {
      name: 'Armhole depth / Profundidad de sisa',
      expression: '(height * 0.12) + 5',
      description: 'Proportional armhole depth from height, or use measured armscyeDepth.',
      variables: ['height'],
      unit: 'cm',
    },
    shoulderSlope: {
      name: 'Shoulder slope / Caída de hombro',
      expression: '2',
      description: 'Standard 2cm drop from neck point over shoulder width.',
      variables: [],
      unit: 'cm',
    },
    backNeckWidth: {
      name: 'Back neck width / Ancho de escote espalda',
      expression: '(neckCirc / 6) + 0.5',
      description: 'Sixth of neck circumference plus 0.5cm.',
      variables: ['neckCirc'],
      unit: 'cm',
    },
    frontNeckDepth: {
      name: 'Front neck depth / Profundidad de escote delantero',
      expression: '(neckCirc / 6) + 1.5',
      description: 'Sixth of neck circumference plus 1.5cm for front scoop.',
      variables: ['neckCirc'],
      unit: 'cm',
    },
    bustDartWidth: {
      name: 'Bust dart width / Ancho de pinza de busto',
      expression: '(bust - chest) / 2',
      description: 'Half the difference between bust and chest circumference.',
      variables: ['chest'],
      unit: 'cm',
    },
    waistDartFront: {
      name: 'Waist dart front / Pinza de cintura delantero',
      expression: '((chest - waist) / 4) * 0.6',
      description: '60% of quarter waist-to-chest difference for front dart.',
      variables: ['chest', 'waist'],
      unit: 'cm',
    },
    waistDartBack: {
      name: 'Waist dart back / Pinza de cintura espalda',
      expression: '((chest - waist) / 4) * 0.4',
      description: '40% of quarter waist-to-chest difference for back dart.',
      variables: ['chest', 'waist'],
      unit: 'cm',
    },
  },
  easeTable: {
    woven: {
      chest: 4,
      waist: 2,
      hips: 4,
      armholeDepth: 1.5,
      shoulder: 0.5,
    },
    stretch: {
      chest: 2,
      waist: 1,
      hips: 2,
      armholeDepth: 1,
      shoulder: 0,
    },
    jersey: {
      chest: 0,
      waist: 0,
      hips: 0,
      armholeDepth: 0.5,
      shoulder: 0,
    },
    outerwear: {
      chest: 8,
      waist: 6,
      hips: 6,
      armholeDepth: 2,
      shoulder: 1,
    },
  },
  constructionSteps: [
    {
      order: 1,
      instruction: 'Draw the back center line (vertical). / Trazar la línea de centro espalda (vertical).',
      toolCalls: ['createPiece'],
      validation: 'Back center line is vertical and at correct neckToWaistBack length.',
    },
    {
      order: 2,
      instruction: 'Mark armhole depth from nape: (height × 0.12) + 5cm down. / Marcar profundidad de sisa desde la nuca: (altura × 0.12) + 5cm hacia abajo.',
      toolCalls: [],
      validation: 'Armhole depth line is horizontal and at correct distance.',
    },
    {
      order: 3,
      instruction: 'Draw back width at bust level: chest/4 + 1cm. / Trazar ancho de espalda a nivel de busto: contorno/4 + 1cm.',
      toolCalls: [],
      validation: 'Back width is approximately one quarter of chest + ease.',
    },
    {
      order: 4,
      instruction: 'Shape back neckline: width = neckCirc/6 + 0.5cm, depth = 2cm. / Dar forma al escote trasero: ancho = cuello/6 + 0.5cm, profundidad = 2cm.',
      toolCalls: ['modifyOutline'],
    },
    {
      order: 5,
      instruction: 'Draw shoulder line with 2cm slope from neck to shoulder point. / Trazar línea de hombro con 2cm de caída desde el cuello al punto de hombro.',
      toolCalls: ['modifyOutline'],
    },
    {
      order: 6,
      instruction: 'Shape back armhole curve from shoulder to side seam. / Dar forma a la curva de sisa trasera desde el hombro hasta la costura lateral.',
      toolCalls: ['modifyOutline'],
    },
    {
      order: 7,
      instruction: 'Add back waist darts: intake = ((chest - waist)/4) × 0.4, length = armholeDepth - 3cm. / Agregar pinzas de cintura traseras: absorción = ((pecho - cintura)/4) × 0.4, largo = profundidad de sisa - 3cm.',
      toolCalls: ['addDart'],
      validation: 'Dart tip ends 2-3cm before bust point.',
    },
    {
      order: 8,
      instruction: 'Create front piece. Draw front center line and mark same armhole depth. / Crear pieza delantera. Trazar línea de centro delantero y marcar la misma profundidad de sisa.',
      toolCalls: ['createPiece'],
    },
    {
      order: 9,
      instruction: 'Shape front neckline: width = neckCirc/6 + 0.5cm, depth = neckCirc/6 + 1.5cm. / Dar forma al escote delantero: ancho = cuello/6 + 0.5cm, profundidad = cuello/6 + 1.5cm.',
      toolCalls: ['modifyOutline'],
    },
    {
      order: 10,
      instruction: 'Add bust dart from side seam: width = (bust - chest)/2. Tip ends 2-3cm before bust point. / Agregar pinza de busto desde la costura lateral: ancho = (busto - pecho)/2. La punta termina 2-3cm antes del punto de pecho.',
      toolCalls: ['addDart'],
      validation: 'Bust dart width matches formula, tip short of bust apex.',
    },
    {
      order: 11,
      instruction: 'Add front waist darts: intake = ((chest - waist)/4) × 0.6. / Agregar pinzas de cintura delanteras: absorción = ((pecho - cintura)/4) × 0.6.',
      toolCalls: ['addDart'],
    },
    {
      order: 12,
      instruction: 'Add grainlines (vertical, center front/back) to both pieces. / Agregar líneas de hilo (verticales, centro delantero/espalda) a ambas piezas.',
      toolCalls: ['addGrainline'],
    },
    {
      order: 13,
      instruction: 'Add notches at side seam, shoulder seam, and center neckline. / Agregar piquetes en costura lateral, costura de hombro y centro del escote.',
      toolCalls: ['addNotch'],
      validation: 'Front has single notches, back has double notches.',
    },
    {
      order: 14,
      instruction: 'Set seam allowance: 10mm standard, 7mm at neckline and armhole. / Establecer margen de costura: 10mm estándar, 7mm en escote y sisa.',
      toolCalls: ['setSeamAllowance'],
    },
  ],
  gradeRules: [
    { point: 'side-bust', measurement: 'chest', deltaX: 0.25, deltaY: 0 },
    { point: 'side-waist', measurement: 'waist', deltaX: 0.25, deltaY: 0 },
    { point: 'side-hem', measurement: 'hips', deltaX: 0.25, deltaY: 0 },
    { point: 'shoulder-neck', measurement: 'neckCirc', deltaX: 0.08, deltaY: 0 },
    { point: 'shoulder-tip', measurement: 'shoulder', deltaX: 0.15, deltaY: -0.05 },
    { point: 'center-back-waist', measurement: 'neckToWaistBack', deltaX: 0, deltaY: 0.25 },
    { point: 'armhole-depth', measurement: 'chest', deltaX: 0, deltaY: 0.15 },
    { point: 'center-front-neck', measurement: 'neckCirc', deltaX: 0, deltaY: 0.08 },
  ],
};
