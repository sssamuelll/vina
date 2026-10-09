/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import { ToolDefinition, type ToolOption } from '../types';
import type { NotchShape } from '../../types/types';
import { DEFAULT_NOTCH_OPTIONS, generateNotchPath } from '../../utils/notches';

const NotchIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 18 18" 
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M9 3V15M6 6L9 3L12 6"/>
  </svg>
);

/**
 * El dibujo de cada forma, para su botón en la línea al pie (spec 2026-10-02
 * § 5.3). Sale de `generateNotchPath`, la misma geometría que pinta el lienzo,
 * así que el botón no puede prometer otra forma. El borde cruza a media altura
 * y la pieza queda abajo: lo que entra baja, lo que sale sube.
 */
function dibujoDeForma(shape: NotchShape): React.FC<{ size?: number }> {
  const d = generateNotchPath({ x: 9, y: 9 }, { x: 0, y: 1 }, { ...DEFAULT_NOTCH_OPTIONS, shape, length: 6, width: 6, count: 1 })
    .map((c) => `${c.type}${c.values.join(',')}`)
    .join(' ');
  const Dibujo: React.FC<{ size?: number }> = ({ size = 18 }) => (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 9H17" opacity={0.45} />
      <path d={d} />
    </svg>
  );
  return Dibujo;
}

/**
 * Las siete formas, con el nombre que ve María: una lista por concepto (contrato
 * § 5). La usan la línea al pie y la etiqueta del piquete (P3c); Propiedades
 * dejó de enseñarlas en P4.
 */
export const FORMAS_DE_PIQUETE: NonNullable<ToolOption['choices']> = [
  { label: 'Recta', value: 'slit', icon: dibujoDeForma('slit') },
  { label: 'En T', value: 't-notch', icon: dibujoDeForma('t-notch') },
  { label: 'V hacia adentro', value: 'v-internal', icon: dibujoDeForma('v-internal') },
  { label: 'V hacia afuera', value: 'v-external', icon: dibujoDeForma('v-external') },
  { label: 'En U', value: 'u-notch', icon: dibujoDeForma('u-notch') },
  { label: 'Almena', value: 'castle', icon: dibujoDeForma('castle') },
  { label: 'Rombo', value: 'diamond', icon: dibujoDeForma('diamond') },
];

export const notchTool: ToolDefinition = {
  id: 'notch',
  name: 'Piquete',
  context: '2d',
  icon: NotchIcon,
  cursor: 'pointer',
  group: 'annotation',
  // Los ids son los nombres de NotchOptions (shape/count/length/width): caen en
  // toolOptions.notch con las claves que lee useNotchTool (G6). El orden es el
  // de la spec 2026-10-02 § 5.3: forma, cantidad, profundidad y ancho.
  options: [
    {
      id: 'shape',
      label: 'Forma',
      type: 'select',
      value: DEFAULT_NOTCH_OPTIONS.shape,
      choices: FORMAS_DE_PIQUETE,
    },
    {
      id: 'count',
      label: 'Cantidad',
      type: 'select',
      value: DEFAULT_NOTCH_OPTIONS.count,
      choices: [
        { label: '1', value: 1 },
        { label: '2', value: 2 },
        { label: '3', value: 3 },
      ],
    },
    // Los rangos que tenía el panel de Propiedades (spec § 5.2), que P4 borró:
    // un rango por opción, y así ningún valor guardado queda fuera.
    {
      id: 'length',
      label: 'Profundidad (mm)',
      type: 'number',
      value: DEFAULT_NOTCH_OPTIONS.length,
      min: 1,
      max: 30,
      step: 1,
    },
    {
      id: 'width',
      label: 'Ancho (mm)',
      type: 'number',
      value: DEFAULT_NOTCH_OPTIONS.width,
      min: 1,
      max: 20,
      step: 1,
    },
  ],
  copilot: {
    description:
      'Add notch markings to pattern edges for alignment during sewing. Notches are small cuts or marks that help match seams accurately when assembling garment pieces. Different notch shapes and counts distinguish between similar seams.',
    examples: [
      'Add a notch to this edge',
      'Place double notches on the back piece',
      'Mark the shoulder seam with a V-notch',
      'Add alignment notches at the waist',
    ],
    keywords: [
      'notch',
      'mark',
      'alignment',
      'matching',
      'slit',
      'cut',
      'indicator',
      'registration',
      'sewing mark',
    ],
    requiresSelection: 'edge',
    produces: 'point',
    undoable: true,
    dangerous: false,
    parameterHints: {
      shape: 'Shape of the notch: slit, T-notch, V-internal, V-external, U-notch, castle, or diamond',
      length: 'Notch depth in millimeters (default 8)',
      count: 'Number of notches: single, double, or triple for distinguishing seams',
      width: 'Notch width in millimeters (default 3)',
    },
  },
};