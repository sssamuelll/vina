import React from 'react';
import { ToolDefinition } from '../types';

const SimulateIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
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
    <polygon points="5,3 19,12 5,21"/>
    <circle cx="12" cy="12" r="2"/>
    <path d="M8 8L10 10"/>
    <path d="M10 14L8 16"/>
  </svg>
);

export const simulateTool: ToolDefinition = {
  id: 'simulate',
  name: 'Simulate',
  context: '3d',
  shortcut: 'space',
  icon: SimulateIcon,
  cursor: 'pointer',
  group: '3d-simulation',
  options: [
    {
      id: 'particleDistance',
      label: 'Particle Distance',
      type: 'number',
      value: 5,
      min: 2,
      max: 15,
      step: 0.5,
    },
    {
      id: 'iterations',
      label: 'Iteration Count',
      type: 'number',
      value: 3,
      min: 1,
      max: 10,
      step: 1,
    },
    {
      id: 'fabricPreset',
      label: 'Fabric Preset',
      type: 'select',
      value: 'cotton',
      choices: [
        { label: 'Cotton', value: 'cotton' },
        { label: 'Silk', value: 'silk' },
        { label: 'Denim', value: 'denim' },
        { label: 'Knit', value: 'knit' },
      ],
    },
  ],
  onActivate: () => {
    console.log('Simulate tool - Coming soon!');
  },
};