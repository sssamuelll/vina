/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import React from 'react';
import { ToolDefinition } from '../types';

const MirrorIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
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
    <path d="M9 2V16"/>
    <path d="M3 6L7 6L7 12L3 12Z"/>
    <path d="M11 6L15 6L15 12L11 12Z"/>
    <path strokeDasharray="2,2" d="M9 2V16"/>
  </svg>
);

export const mirrorTool: ToolDefinition = {
  id: 'mirror',
  name: 'Mirror/Symmetric',
  context: '2d',
  shortcut: 'i',
  icon: MirrorIcon,
  cursor: 'crosshair',
  group: 'pattern',
  options: [
    {
      id: 'axis',
      label: 'Mirror Axis',
      type: 'select',
      value: 'vertical',
      choices: [
        { label: 'Vertical', value: 'vertical' },
        { label: 'Horizontal', value: 'horizontal' },
        { label: 'Custom Angle', value: 'custom' },
      ],
    },
    {
      id: 'keepOriginal',
      label: 'Keep Original',
      type: 'toggle',
      value: true,
    },
  ],
  onActivate: () => {
    console.log('Mirror/Symmetric tool - Coming soon!');
  },
  copilot: {
    description:
      'Mirror or reflect pattern pieces across an axis. Creates symmetric copies of pattern pieces, useful for creating left/right versions of garment pieces or establishing symmetry lines for half-patterns.',
    examples: [
      'Mirror this pattern piece vertically',
      'Reflect the bodice across the center line',
      'Create a symmetric copy of the sleeve',
      'Flip this piece horizontally and keep the original',
    ],
    keywords: [
      'mirror',
      'reflect',
      'flip',
      'symmetric',
      'symmetry',
      'copy',
      'duplicate',
      'reverse',
      'left right',
      'axis',
    ],
    requiresSelection: 'piece',
    produces: 'piece',
    undoable: true,
    dangerous: false,
    parameterHints: {
      axis: 'The axis to mirror across: vertical, horizontal, or custom angle',
      keepOriginal: 'Whether to keep the original piece or only create the mirrored version',
    },
  },
};