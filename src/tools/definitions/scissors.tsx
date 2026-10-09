/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import { ToolDefinition } from '../types';
import { TIPOS_DE_COSTURA } from '../../utils/seam/tiposDeCostura';

const ScissorsIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
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
    <circle cx="5" cy="5" r="2.5" />
    <circle cx="5" cy="13" r="2.5" />
    <path d="M7 6.5L15 14" />
    <path d="M7 11.5L15 4" />
  </svg>
);

export const scissorsTool: ToolDefinition = {
  id: 'scissors',
  name: 'Tijeras',
  context: '2d',
  shortcut: 'x',
  icon: ScissorsIcon,
  cursor: 'crosshair',
  group: 'pattern',
  options: [
    {
      id: 'autoSew',
      label: 'Coser el corte automáticamente',
      type: 'toggle',
      value: true,
    },
    {
      id: 'seamType',
      label: 'Tipo de costura',
      type: 'select',
      value: 'standard',
      // La misma lista que la etiqueta de la costura y Propiedades (P3c).
      choices: TIPOS_DE_COSTURA.map(t => ({ label: t.label, value: t.value })),
    },
  ],
  copilot: {
    description:
      'Cut or split pattern pieces along a line. Divides a single pattern piece into two or more separate pieces, useful for creating style lines, adding seams, or separating pattern sections for different fabrics or construction methods.',
    examples: [
      'Cut this pattern piece in half',
      'Split the bodice along this line',
      'Divide the skirt panel here',
      'Create a style line by cutting through this piece',
    ],
    keywords: [
      'cut',
      'scissors',
      'split',
      'divide',
      'separate',
      'slice',
      'trim',
      'style line',
      'partition',
    ],
    requiresSelection: 'none',
    produces: 'piece',
    undoable: true,
    dangerous: true,
  },
};
