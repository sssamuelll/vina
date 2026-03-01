/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import { ToolDefinition } from '../types';

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

export const notchTool: ToolDefinition = {
  id: 'notch',
  name: 'Notch',
  context: '2d',
  icon: NotchIcon,
  cursor: 'pointer',
  group: 'annotation',
  options: [
    {
      id: 'notchShape',
      label: 'Notch Shape',
      type: 'select',
      value: 'v-external',
      choices: [
        { label: 'Slit', value: 'slit' },
        { label: 'T-Notch', value: 't-notch' },
        { label: 'V Internal', value: 'v-internal' },
        { label: 'V External', value: 'v-external' },
        { label: 'U-Notch', value: 'u-notch' },
        { label: 'Castle', value: 'castle' },
        { label: 'Diamond', value: 'diamond' },
      ],
    },
    {
      id: 'notchSize',
      label: 'Size',
      type: 'number',
      value: 8,
      min: 3,
      max: 20,
      step: 1,
    },
    {
      id: 'notchCount',
      label: 'Count',
      type: 'select',
      value: 1,
      choices: [
        { label: 'Single', value: 1 },
        { label: 'Double', value: 2 },
        { label: 'Triple', value: 3 },
      ],
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
      notchShape: 'Shape of the notch: slit, T-notch, V-internal, V-external, U-notch, castle, or diamond',
      notchSize: 'Size of the notch in millimeters',
      notchCount: 'Number of notches: single, double, or triple for distinguishing seams',
    },
  },
};