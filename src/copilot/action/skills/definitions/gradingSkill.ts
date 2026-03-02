/**
 * Grading / Gradación Skill — size grading standards and grade rules.
 *
 * Covers EU women's (34-48), EU men's (44-56), US women's (0-16), and
 * UK (6-20) size standards with per-point grading rules and cross-size
 * validation.
 *
 * @module skills/definitions/gradingSkill
 */

import type { PatternSkill } from '../types';

/** Grading standards skill definition */
export const gradingSkill: PatternSkill = {
  name: 'grading',
  triggers: [
    // English
    'grading', 'grade rules', 'size range', 'size chart', 'grade table',
    'size grading', 'grade',
    // Spanish
    'gradación', 'gradacion', 'escalar', 'tallas', 'tabla de tallas',
    'reglas de gradación', 'escalado',
  ],
  description:
    'Grading/Gradación standards — EU, US, UK size tables with per-measurement ' +
    'increments and per-point grading rules for proportional scaling.',
  methods: [
    {
      name: 'EU Women (34-48)',
      origin: 'EU',
      description:
        'European women\'s sizing. Base measurement is bust circumference. ' +
        'Size number = bust/2. Standard 2cm increment per size for primary measurements.',
      formulas: {
        bustIncrement: '2',
        waistIncrement: '2',
        hipIncrement: '2',
        backLengthIncrement: '0.5',
        shoulderIncrement: '0.3',
        armholeDepthIncrement: '0.3',
        armLengthIncrement: '0.5',
        neckIncrement: '0.5',
      },
    },
    {
      name: 'EU Men (44-56)',
      origin: 'EU',
      description:
        'European men\'s sizing. Chest-based. Larger increments than women\'s ' +
        'with straighter proportional changes.',
      formulas: {
        chestIncrement: '2',
        waistIncrement: '2',
        hipIncrement: '1.5',
        backLengthIncrement: '0.5',
        shoulderIncrement: '0.4',
        armholeDepthIncrement: '0.3',
        armLengthIncrement: '0.5',
        neckIncrement: '0.5',
      },
    },
    {
      name: 'US Women (0-16)',
      origin: 'US',
      description:
        'US women\'s sizing (ASTM). Even numbers 0 through 16. ' +
        '2-inch (5cm) bust increments between sizes.',
      formulas: {
        bustIncrement: '2.5',
        waistIncrement: '2.5',
        hipIncrement: '2.5',
        backLengthIncrement: '0.5',
        shoulderIncrement: '0.3',
        armholeDepthIncrement: '0.3',
      },
    },
    {
      name: 'UK Women (6-20)',
      origin: 'UK',
      description:
        'UK women\'s sizing. Even numbers 6 through 20. ' +
        '2-inch (5cm) bust increments, similar to US but different base.',
      formulas: {
        bustIncrement: '2.5',
        waistIncrement: '2.5',
        hipIncrement: '2.5',
        backLengthIncrement: '0.5',
        shoulderIncrement: '0.3',
        armholeDepthIncrement: '0.3',
      },
    },
  ],
  formulas: {
    bustIncrement: {
      name: 'Bust increment / Incremento de busto',
      expression: '2',
      description: 'Standard 2cm bust increment per EU size (4cm circumference = 2cm per half).',
      variables: ['chest'],
      unit: 'cm',
    },
    waistIncrement: {
      name: 'Waist increment / Incremento de cintura',
      expression: '2',
      description: 'Standard 2cm waist increment per EU size.',
      variables: ['waist'],
      unit: 'cm',
    },
    hipIncrement: {
      name: 'Hip increment / Incremento de cadera',
      expression: '2',
      description: 'Standard 2cm hip increment per EU size.',
      variables: ['hips'],
      unit: 'cm',
    },
    backLengthIncrement: {
      name: 'Back length increment / Incremento largo espalda',
      expression: '0.5',
      description: 'Standard 0.5cm back length increment per EU size.',
      variables: ['neckToWaistBack'],
      unit: 'cm',
    },
    shoulderIncrement: {
      name: 'Shoulder increment / Incremento de hombro',
      expression: '0.3',
      description: 'Standard 0.3cm shoulder width increment per EU size.',
      variables: ['shoulder'],
      unit: 'cm',
    },
    armholeDepthIncrement: {
      name: 'Armhole depth increment / Incremento profundidad sisa',
      expression: '0.3',
      description: 'Standard 0.3cm armhole depth increment per EU size.',
      variables: ['armscyeDepth'],
      unit: 'cm',
    },
    neckIncrement: {
      name: 'Neck increment / Incremento de cuello',
      expression: '0.5',
      description: 'Standard 0.5cm neck circumference increment per EU size.',
      variables: ['neckCirc'],
      unit: 'cm',
    },
  },
  easeTable: {
    'EU-women-34': {
      chest: 80,
      waist: 64,
      hips: 88,
      shoulder: 11.8,
      neckCirc: 34,
      neckToWaistBack: 39.5,
    },
    'EU-women-36': {
      chest: 84,
      waist: 68,
      hips: 92,
      shoulder: 12.1,
      neckCirc: 34.5,
      neckToWaistBack: 40,
    },
    'EU-women-38': {
      chest: 88,
      waist: 72,
      hips: 96,
      shoulder: 12.4,
      neckCirc: 35,
      neckToWaistBack: 40.5,
    },
    'EU-women-40': {
      chest: 92,
      waist: 76,
      hips: 100,
      shoulder: 12.7,
      neckCirc: 35.5,
      neckToWaistBack: 41,
    },
    'EU-women-42': {
      chest: 96,
      waist: 80,
      hips: 104,
      shoulder: 13,
      neckCirc: 36,
      neckToWaistBack: 41.5,
    },
    'EU-women-44': {
      chest: 100,
      waist: 84,
      hips: 108,
      shoulder: 13.3,
      neckCirc: 36.5,
      neckToWaistBack: 42,
    },
    'EU-women-46': {
      chest: 104,
      waist: 88,
      hips: 112,
      shoulder: 13.6,
      neckCirc: 37,
      neckToWaistBack: 42.5,
    },
    'EU-women-48': {
      chest: 108,
      waist: 92,
      hips: 116,
      shoulder: 13.9,
      neckCirc: 37.5,
      neckToWaistBack: 43,
    },
  },
  constructionSteps: [
    {
      order: 1,
      instruction: 'Identify base size from current measurements (match bust to size chart). / Identificar talla base desde las medidas actuales (coincidir busto con tabla de tallas).',
      toolCalls: ['getMeasurements'],
      validation: 'Base size correctly identified from measurement table.',
    },
    {
      order: 2,
      instruction: 'Select target size range (e.g. EU 36-44). / Seleccionar rango de tallas objetivo (ej. EU 36-44).',
      toolCalls: [],
    },
    {
      order: 3,
      instruction: 'Calculate per-point increments using grade rules. Each point has specific X/Y shifts. / Calcular incrementos por punto usando reglas de gradación. Cada punto tiene desplazamientos X/Y específicos.',
      toolCalls: [],
      validation: 'Increments are proportional and consistent.',
    },
    {
      order: 4,
      instruction: 'Apply grading to each pattern piece. Scale outline points using per-point rules. / Aplicar gradación a cada pieza. Escalar puntos del contorno usando reglas por punto.',
      toolCalls: ['gradePiece'],
    },
    {
      order: 5,
      instruction: 'Validate graded sizes: check seam lengths match between connected pieces. / Validar tallas gradadas: verificar que los largos de costura coincidan entre piezas conectadas.',
      toolCalls: ['auditSeamAllowances'],
      validation: 'Side seam lengths match between front and back across all sizes.',
    },
    {
      order: 6,
      instruction: 'Cross-size validation: check that proportions stay reasonable (bust-waist ratio, armhole shape). / Validación entre tallas: verificar que las proporciones se mantengan razonables (relación busto-cintura, forma de sisa).',
      toolCalls: [],
      validation: 'No proportion exceeds ±15% from base size ratio.',
    },
  ],
  gradeRules: [
    // Bodice grading rules (per half-pattern point)
    { point: 'center-back-neck', measurement: 'neckCirc', deltaX: 0, deltaY: 0 },
    { point: 'shoulder-neck', measurement: 'neckCirc', deltaX: 0.042, deltaY: 0 },
    { point: 'shoulder-tip', measurement: 'shoulder', deltaX: 0.15, deltaY: -0.05 },
    { point: 'armhole-side', measurement: 'chest', deltaX: 0.25, deltaY: 0.15 },
    { point: 'side-bust', measurement: 'chest', deltaX: 0.25, deltaY: 0 },
    { point: 'side-waist', measurement: 'waist', deltaX: 0.25, deltaY: 0 },
    { point: 'side-hip', measurement: 'hips', deltaX: 0.25, deltaY: 0 },
    { point: 'center-front-neck', measurement: 'neckCirc', deltaX: 0, deltaY: 0.042 },
    { point: 'center-back-hem', measurement: 'neckToWaistBack', deltaX: 0, deltaY: 0.25 },
    // Sleeve grading rules
    { point: 'sleeve-cap', measurement: 'shoulder', deltaX: 0.15, deltaY: -0.05 },
    { point: 'sleeve-bicep', measurement: 'chest', deltaX: 0.2, deltaY: 0 },
    { point: 'sleeve-hem', measurement: 'armLength', deltaX: 0, deltaY: 0.25 },
    // Skirt grading rules
    { point: 'skirt-waist', measurement: 'waist', deltaX: 0.25, deltaY: 0 },
    { point: 'skirt-hip', measurement: 'hips', deltaX: 0.25, deltaY: 0 },
    { point: 'skirt-hem', measurement: 'hips', deltaX: 0.25, deltaY: 0 },
  ],
};
