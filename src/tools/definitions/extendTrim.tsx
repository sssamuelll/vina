/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import { ToolDefinition } from '../types';

const ExtendTrimIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
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
    {/* Base line */}
    <path d="M3 9L11 9" />
    {/* Extension arrow beyond the line */}
    <path d="M11 9L16 9" strokeDasharray="2 1.5" />
    <path d="M14 6.5L16.5 9L14 11.5" />
  </svg>
);

export const extendTrimTool: ToolDefinition = {
  id: 'extendTrim',
  name: 'Extender / recortar',
  context: '2d',
  shortcut: 'u',
  icon: ExtendTrimIcon,
  cursor: 'crosshair',
  group: 'pattern',
  options: [
    {
      id: 'mode',
      label: 'Acción',
      type: 'select',
      value: 'extend',
      choices: [
        { label: 'Extender', value: 'extend' },
        { label: 'Recortar', value: 'trim' },
      ],
    },
    {
      id: 'distance',
      label: 'Distancia (mm)',
      type: 'number',
      value: 20,
      min: 1,
      max: 500,
      step: 1,
    },
  ],
  copilot: {
    description:
      'Extend or trim pattern piece edges. In Extend mode, lengthen an edge beyond its current endpoint along its tangent direction. In Trim mode, shorten an edge by clicking where to cut it. Useful for adjusting hem lengths, neckline depth, or shoulder width.',
    examples: [
      'Extend this edge by 20mm',
      'Trim the bottom edge at this point',
      'Lengthen the side seam by 30mm',
      'Shorten the shoulder line here',
    ],
    keywords: [
      'extend',
      'trim',
      'shorten',
      'lengthen',
      'edge',
      'stretch',
      'cut',
      'truncate',
      'prolong',
    ],
    requiresSelection: 'piece',
    produces: 'modification',
    undoable: true,
    dangerous: false,
    parameterHints: {
      mode: 'Extend to lengthen an edge, Trim to shorten it',
      distance: 'Distance in mm to extend the edge (used in Extend mode)',
    },
  },
};
