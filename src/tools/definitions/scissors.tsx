import React from 'react';
import { ToolDefinition } from '../types';

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
  name: 'Scissors (Split)',
  context: '2d',
  shortcut: 'x',
  icon: ScissorsIcon,
  cursor: 'crosshair',
  group: 'pattern',
  options: [
    {
      id: 'cutType',
      label: 'Cut Type',
      type: 'select',
      value: 'straight',
      choices: [
        { label: 'Straight', value: 'straight' },
        { label: 'Curved', value: 'curved' },
      ],
    },
    {
      id: 'keepBoth',
      label: 'Keep Both Sides',
      type: 'toggle',
      value: true,
    },
  ],
};
