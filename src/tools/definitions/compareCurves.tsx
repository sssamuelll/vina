/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import { ToolDefinition } from '../types';

const CompareCurvesIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
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
    {/* Solid curve */}
    <path d="M3 12C5 6 8 4 15 6" />
    {/* Dashed curve */}
    <path d="M3 14C5 8 8 6 15 8" strokeDasharray="2 2" />
  </svg>
);

export const compareCurvesTool: ToolDefinition = {
  id: 'compareCurves',
  // «Comparar largos» y no «Comparar curvas»: compara LARGOS, no formas, y
  // «curva» es palabra de geometría. María lee bordes.
  name: 'Comparar largos',
  description: 'Compara el largo de dos bordes y dice la diferencia',
  context: '2d',
  icon: CompareCurvesIcon,
  cursor: 'crosshair',
  group: 'annotation',
  options: [
    {
      id: 'markerInterval',
      // Mismo rótulo que en Medir el borde: es la misma opción del mismo motor,
      // y dos nombres para lo mismo se leen como dos cosas distintas.
      label: 'Marcas cada',
      type: 'select',
      value: '50',
      choices: [
        { label: '25 mm', value: '25' },
        { label: '50 mm', value: '50' },
        { label: '100 mm', value: '100' },
      ],
    },
  ],
  copilot: {
    description:
      'Compare the arc lengths of two pattern edges to check ease and fit. Highlights the difference (delta) between two curves, useful for verifying that seam lines match or that intended ease is correctly distributed.',
    examples: [
      'Compare the armhole and sleeve cap lengths',
      'Check the ease between the side seam and lining edge',
      'What is the difference between these two curve lengths?',
    ],
    keywords: [
      'compare',
      'ease',
      'delta',
      'difference',
      'match',
      'seam length',
    ],
    requiresSelection: 'none',
    produces: 'measurement',
    undoable: false,
    dangerous: false,
    parameterHints: {
      markerInterval:
        'Distance between markers when comparing curves (mm)',
    },
  },
};
