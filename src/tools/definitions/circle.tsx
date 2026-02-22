import React from 'react';
import { ToolDefinition } from '../types';

const CircleIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
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
    <circle cx="9" cy="9" r="6"/>
  </svg>
);

export const circleTool: ToolDefinition = {
  id: 'circle',
  name: 'Circle/Curve Tool',
  context: '2d',
  icon: CircleIcon,
  cursor: 'crosshair',
  group: 'draw',
  options: [
    {
      id: 'shapeType',
      label: 'Shape Type',
      type: 'select',
      value: 'circle',
      choices: [
        { label: 'Circle', value: 'circle' },
        { label: 'Ellipse', value: 'ellipse' },
        { label: 'Arc', value: 'arc' },
      ],
    },
    {
      id: 'radius',
      label: 'Radius',
      type: 'number',
      value: 50,
      min: 5,
      max: 500,
      step: 5,
    },
  ],
  onActivate: () => {
    console.log('Circle/Curve tool - Coming soon!');
  },
};