/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import { ToolDefinition } from '../types';

const OffsetOutlineIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
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
    {/* Inner rectangle */}
    <rect x="5" y="5" width="8" height="8" />
    {/* Outer rectangle (offset) */}
    <rect x="2" y="2" width="14" height="14" strokeDasharray="2 1.5" />
  </svg>
);

export const offsetOutlineTool: ToolDefinition = {
  id: 'offsetOutline',
  name: 'Desplazar contorno',
  context: '2d',
  shortcut: 'r',
  icon: OffsetOutlineIcon,
  cursor: 'crosshair',
  group: 'pattern',
  options: [
    {
      id: 'distance',
      label: 'Distance (mm)',
      type: 'number',
      value: 10,
      min: 1,
      max: 200,
      step: 1,
    },
    {
      id: 'direction',
      label: 'Direction',
      type: 'select',
      value: 'outward',
      choices: [
        { label: 'Outward', value: 'outward' },
        { label: 'Inward', value: 'inward' },
        { label: 'Both', value: 'both' },
      ],
    },
    {
      id: 'joinType',
      label: 'Join Type',
      type: 'select',
      value: 'round',
      choices: [
        { label: 'Round', value: 'round' },
        { label: 'Miter', value: 'miter' },
        { label: 'Square', value: 'square' },
      ],
    },
    {
      id: 'replace',
      label: 'Replace Original',
      type: 'toggle',
      value: false,
    },
  ],
  copilot: {
    description:
      'Offset a pattern piece outline inward or outward by a given distance. Creates a parallel copy of the outline, useful for adding seam allowances, creating linings, or generating inner/outer shells of a pattern piece.',
    examples: [
      'Offset this piece outward by 10mm',
      'Shrink the outline inward by 5mm',
      'Create a parallel outline 15mm outside this piece',
      'Inset this piece by 8mm for the lining',
    ],
    keywords: [
      'offset',
      'parallel',
      'expand',
      'shrink',
      'inset',
      'outset',
      'buffer',
      'margin',
      'grow',
      'contract',
    ],
    requiresSelection: 'piece',
    produces: 'piece',
    undoable: true,
    dangerous: false,
    parameterHints: {
      distance: 'Distance in mm to offset the outline',
      direction: 'Whether to offset outward (expand), inward (shrink), or both',
      joinType: 'Corner join style: round, miter (sharp), or square (beveled)',
      replace: 'If true, replaces the original piece; if false, creates a new piece alongside',
    },
  },
};
