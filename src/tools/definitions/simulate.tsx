/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
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
  hidden: true, // Hidden from the canvas toolbar; triggered via copilot tool calls / commands mode
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
  copilot: {
    description: 'Run XPBD cloth physics simulation to drape the garment realistically on the avatar. The simulation considers fabric properties, gravity, and collision with the body. Use this to see how the pattern will look when sewn and worn.',
    examples: [
      'Run the simulation',
      'Simulate the garment',
      'Show me how it drapes',
      'Start cloth physics',
      'Drape the pattern on the body',
    ],
    keywords: ['simulate', 'drape', 'physics', 'cloth', 'run', 'start', 'play', 'gravity'],
    requiresSelection: 'none',
    produces: 'simulation',
    undoable: false,
    parameterHints: {
      particleDistance: 'Distance between simulation particles in mm. Lower = more detail but slower.',
      iterations: 'Solver iterations per frame. Higher = stiffer/more accurate but slower.',
      fabricPreset: 'Predefined fabric behavior: cotton (medium), silk (drapey), denim (stiff), knit (stretchy).',
    },
  },
};