/**
 * Bodice Front Block — Aldrich method (simplified)
 * 
 * This is a real pattern-making construction, not AI-generated coordinates.
 * Based on "Metric Pattern Cutting for Women's Wear" by Winifred Aldrich.
 * 
 * Required measurements (in mm):
 * - chest: chest circumference
 * - waist: waist circumference  
 * - shoulder: shoulder length (nape to shoulder tip)
 * - height: body height (for derivations)
 * 
 * The blueprint derives missing measurements from standard proportions.
 */

import type { Blueprint } from '../../../types/blueprint';

export const bodiceFrontBlock: Blueprint = {
  id: 'aldrich-bodice-front',
  name: 'Bodice Front Block (Aldrich)',
  nameEs: 'Bloque Base Delantero (Aldrich)',
  description: 'Front bodice block/sloper using the Aldrich method. Foundation for blouses, dresses, jackets.',
  descriptionEs: 'Bloque base delantero usando el método Aldrich. Base para blusas, vestidos, chaquetas.',
  category: 'blocks',
  method: 'Aldrich',
  requiredMeasurements: ['chest', 'waist', 'height'],
  variables: {
    ease: { label: 'Ease', labelEs: 'Holgura', default: 10, description: 'Ease at chest in mm' },
    neckCirc: { label: 'Neck Circumference', labelEs: 'Contorno Cuello', default: 'chest*0.36', description: 'Derived from chest if not measured' },
    backLength: { label: 'Back Length', labelEs: 'Largo Espalda', default: 'height*0.25', description: 'Nape to waist' },
    frontLength: { label: 'Front Length', labelEs: 'Largo Delantero', default: 'height*0.26', description: 'Shoulder to waist front' },
    armholeDepth: { label: 'Armhole Depth', labelEs: 'Profundidad Sisa', default: 'height*0.12+50', description: 'Derived from height' },
    shoulderLength: { label: 'Shoulder Length', labelEs: 'Largo Hombro', default: 'shoulder/2', description: 'Half shoulder width' },
  },
  steps: [
    // Origin point (center back neck)
    {
      tool: 'addConstructionPoint', label: 'A', type: 'absolute', x: 0, y: 0,
      comment: 'Origin — center back neck point',
      commentEs: 'Origen — punto central cuello espalda',
    },
    // Chest width (quarter chest + ease)
    {
      tool: 'addConstructionPoint', label: 'B', type: 'endLine',
      basePoint: 'A', angle: 0, length: 'chest/4+ease',
      comment: 'Chest width — quarter bust + ease',
      commentEs: 'Ancho pecho — cuarto de busto + holgura',
    },
    // Front length down
    {
      tool: 'addConstructionPoint', label: 'C', type: 'endLine',
      basePoint: 'A', angle: 270, length: 'frontLength',
      comment: 'Waist center — front length from origin',
      commentEs: 'Centro cintura — largo delantero desde origen',
    },
    // Waist side corner
    {
      tool: 'addConstructionPoint', label: 'D', type: 'intersectionXY',
      xFrom: 'B', yFrom: 'C',
      comment: 'Waist side — corner of front panel',
      commentEs: 'Cintura lateral — esquina del panel delantero',
    },
    // Armhole depth line
    {
      tool: 'addConstructionPoint', label: 'E', type: 'endLine',
      basePoint: 'A', angle: 270, length: 'armholeDepth',
      comment: 'Armhole depth — chest line at center',
      commentEs: 'Profundidad sisa — línea de pecho al centro',
    },
    // Armhole side point
    {
      tool: 'addConstructionPoint', label: 'F', type: 'intersectionXY',
      xFrom: 'B', yFrom: 'E',
      comment: 'Armhole side — where side seam meets chest line',
      commentEs: 'Sisa lateral — donde la costura lateral encuentra la línea de pecho',
    },
    // Neck width point
    {
      tool: 'addConstructionPoint', label: 'neckWidth', type: 'endLine',
      basePoint: 'A', angle: 0, length: 'neckCirc/6+5',
      comment: 'Neck width — 1/6 neck circumference + 5mm',
      commentEs: 'Ancho cuello — 1/6 contorno cuello + 5mm',
    },
    // Neck depth (front is deeper than back)
    {
      tool: 'addConstructionPoint', label: 'neckDepth', type: 'endLine',
      basePoint: 'A', angle: 270, length: 'neckCirc/6+15',
      comment: 'Neck depth — front neckline is deeper than back',
      commentEs: 'Profundidad escote — el escote delantero es más profundo',
    },
    // Shoulder tip
    {
      tool: 'addConstructionPoint', label: 'shoulder', type: 'endLine',
      basePoint: 'neckWidth', angle: 255, length: 'shoulderLength',
      comment: 'Shoulder tip — end of shoulder seam (15° slope)',
      commentEs: 'Punta hombro — fin de la costura de hombro (15° de caída)',
    },
    // Construction lines
    {
      tool: 'addConstructionLine', label: 'centerFront', from: 'A', to: 'C', style: 'dashed',
      comment: 'Center front line',
      commentEs: 'Línea centro delantero',
    },
    {
      tool: 'addConstructionLine', label: 'chestLine', from: 'E', to: 'F', style: 'construction',
      comment: 'Chest line (bust level)',
      commentEs: 'Línea de pecho (nivel busto)',
    },
    {
      tool: 'addConstructionLine', label: 'waistLine', from: 'C', to: 'D', style: 'construction',
      comment: 'Waist line',
      commentEs: 'Línea de cintura',
    },
    {
      tool: 'addConstructionLine', label: 'shoulderLine', from: 'neckWidth', to: 'shoulder',
      comment: 'Shoulder seam',
      commentEs: 'Costura de hombro',
    },
    // Neckline curve
    {
      tool: 'addConstructionCurve', label: 'neckCurve',
      from: 'neckDepth', to: 'neckWidth',
      angle1: 0, angle2: 270,
      length1: 'neckCirc/6', length2: 'neckCirc/8',
      comment: 'Front neckline curve — smooth scoop from center to shoulder',
      commentEs: 'Curva escote delantero — curva suave del centro al hombro',
    },
    // Armhole curve
    {
      tool: 'addConstructionCurve', label: 'armholeCurve',
      from: 'shoulder', to: 'F',
      angle1: 260, angle2: 180,
      length1: 'armholeDepth*0.4', length2: 'armholeDepth*0.3',
      comment: 'Armhole curve — from shoulder tip to side seam',
      commentEs: 'Curva de sisa — desde punta hombro hasta costura lateral',
    },
    // Build the piece
    {
      tool: 'buildPieceFromConstruction',
      name: 'Delantero / Front Bodice',
      points: ['neckDepth', 'neckWidth', 'shoulder', 'F', 'D', 'C'],
      curves: ['neckCurve', null, 'armholeCurve', null, null, null],
      seamAllowance: 10,
      comment: 'Close the piece: neckline → shoulder → armhole → side seam → waist → center front',
      commentEs: 'Cerrar pieza: escote → hombro → sisa → costura lateral → cintura → centro delantero',
    },
  ],
  source: 'builtin',
  tags: ['bodice', 'corpiño', 'blouse', 'blusa', 'block', 'sloper', 'aldrich', 'front', 'delantero', 'top', 'tshirt', 't-shirt', 'camiseta', 'shirt', 'camisa'],
  version: 1,
  createdAt: 0,
  updatedAt: 0,
};
