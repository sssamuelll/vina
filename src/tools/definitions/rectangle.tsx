import React from 'react';
import { ToolDefinition } from '../types';

const RectangleIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
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
    <rect x="3" y="5" width="12" height="8"/>
  </svg>
);

export const rectangleTool: ToolDefinition = {
  id: 'rectangle',
  name: 'Rectangle Tool',
  context: '2d',
  shortcut: 'r',
  icon: RectangleIcon,
  cursor: 'crosshair',
  group: 'draw',
  options: [
    {
      id: 'width',
      label: 'Width',
      type: 'number',
      value: 100,
      min: 10,
      max: 1000,
      step: 5,
    },
    {
      id: 'height',
      label: 'Height',
      type: 'number',
      value: 100,
      min: 10,
      max: 1000,
      step: 5,
    },
    {
      id: 'cornerStyle',
      label: 'Corner Style',
      type: 'select',
      value: 'square',
      choices: [
        { label: 'Square', value: 'square' },
        { label: 'Rounded', value: 'rounded' },
        { label: 'Chamfered', value: 'chamfered' },
      ],
    },
  ],
};