/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import { ToolDefinition } from '../types';

const SlashAndSpreadIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
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
    {/* Left half of piece */}
    <path d="M2 14L5 4L8 14Z" />
    {/* Right half of piece */}
    <path d="M10 14L13 4L16 14Z" />
    {/* Arrow indicating spread */}
    <path d="M8 9L10 9" />
    <path d="M7 9L8 8M7 9L8 10" />
    <path d="M11 9L10 8M11 9L10 10" />
  </svg>
);

export const slashAndSpreadTool: ToolDefinition = {
  id: 'slashAndSpread',
  name: 'Slash & Spread',
  context: '2d',
  icon: SlashAndSpreadIcon,
  cursor: 'crosshair',
  group: 'pattern',
  options: [
    {
      id: 'mode',
      label: 'Spread Mode',
      type: 'select',
      value: 'pivot',
      choices: [
        { label: 'Pivot (Angle)', value: 'pivot' },
        { label: 'Parallel (Distance)', value: 'parallel' },
      ],
    },
    {
      id: 'gapFill',
      label: 'Gap Fill',
      type: 'select',
      value: 'straight',
      choices: [
        { label: 'Straight', value: 'straight' },
        { label: 'Smooth Curve', value: 'smooth' },
      ],
    },
  ],
  copilot: {
    description:
      'Slash and spread a pattern piece to add fullness. Cuts a piece along a line and spreads the halves apart by rotating (pivot mode) or translating (parallel mode). Used for flared skirts, dart equivalency, and adding ease.',
    examples: [
      'Spread this skirt panel 15 degrees for flare',
      'Slash and spread the bodice to add fullness',
      'Add 20mm ease by slashing this piece',
    ],
    keywords: ['slash', 'spread', 'fullness', 'flare', 'ease', 'pivot', 'rotate', 'wedge'],
    requiresSelection: 'piece',
    produces: 'piece',
    undoable: true,
    dangerous: false,
  },
};
