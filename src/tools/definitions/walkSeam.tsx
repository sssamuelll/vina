/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import { ToolDefinition } from '../types';

const WalkSeamIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
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
    {/* Two edges with walking dot */}
    <path d="M3 5L15 5" />
    <path d="M3 13L15 13" strokeDasharray="2 2" />
    <circle cx="9" cy="5" r="2" fill="currentColor" />
    <path d="M9 7V11" strokeDasharray="1 1" />
  </svg>
);

export const walkSeamTool: ToolDefinition = {
  id: 'walkSeam',
  name: 'Recorrer costura',
  description: 'Walk along sewn edges to verify length matching and ease distribution',
  context: '2d',
  icon: WalkSeamIcon,
  cursor: 'crosshair',
  group: 'annotation',
  options: [
    {
      id: 'tolerance',
      label: 'Tolerance',
      type: 'select',
      value: '3',
      choices: [
        { label: '1mm', value: '1' },
        { label: '3mm', value: '3' },
        { label: '5mm', value: '5' },
      ],
    },
    {
      id: 'ghostOpacity',
      label: 'Ghost Opacity',
      type: 'number',
      value: 30,
      min: 10,
      max: 80,
      step: 10,
    },
  ],
  copilot: {
    description:
      'Walk along sewn edges to verify that seam lengths match. Shows a ghost preview of the paired pattern piece sliding along the stationary edge, with color-coded mismatch visualization (green/yellow/red) and metrics including delta and ease percentage.',
    examples: [
      'Walk the armhole seam to check for ease',
      'Verify the side seam lengths match',
      'Check the shoulder seam alignment',
    ],
    keywords: [
      'walk',
      'seam',
      'verify',
      'ease',
      'match',
      'alignment',
      'length',
    ],
    requiresSelection: 'none',
    produces: 'measurement',
    undoable: false,
    dangerous: false,
    parameterHints: {
      tolerance: 'Mismatch threshold in mm (1, 3, or 5)',
      ghostOpacity: 'Opacity of the ghost piece preview (10-80%)',
    },
  },
};
