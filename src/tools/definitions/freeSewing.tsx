/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import { ToolDefinition } from '../types';

const FreeSewingIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
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
    <path d="M3 6L15 12"/>
    <path d="M6 3L12 15"/>
    <path d="M3 6L6 3M12 15L15 12"/>
    <circle cx="6" cy="6" r="1"/>
    <circle cx="12" cy="12" r="1"/>
  </svg>
);

export const freeSewingTool: ToolDefinition = {
  id: 'freesewing',
  name: 'Free Sewing',
  context: '2d',
  shortcut: 'f',
  icon: FreeSewingIcon,
  cursor: 'crosshair',
  group: 'sewing',
  options: [
    {
      id: 'sewingType',
      label: 'Sewing Type',
      type: 'select',
      value: 'free',
      choices: [
        { label: 'Free', value: 'free' },
        { label: 'Point-to-Point', value: 'point' },
      ],
    },
  ],
  onActivate: () => {
    console.log('Free Sewing tool - Coming soon!');
  },
  copilot: {
    description: 'Create free-form sewing connections between pattern pieces without strict edge alignment. Free mode allows drawing arbitrary sewing lines across pieces. Point-to-point mode connects specific anchor points between pieces. Useful for complex construction details like gathers, pleats, or unconventional seam placements.',
    examples: [
      'Sew these two pieces together freely',
      'Create a gathering seam here',
      'Connect these points with a seam',
      'Add a free sewing line between panels',
    ],
    keywords: ['free sewing', 'freehand', 'manual sew', 'gather', 'pleat', 'custom seam', 'point-to-point'],
    requiresSelection: 'none',
    produces: 'seam',
    undoable: true,
    parameterHints: {
      sewingType: 'Free mode draws sewing lines anywhere; Point-to-Point connects specific anchor points',
    },
  },
};