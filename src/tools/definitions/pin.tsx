import React from 'react';
import { ToolDefinition } from '../types';

const PinIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
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
    <path d="M9 9L15 3L12 0L6 6L0 12L3 15L9 9Z"/>
    <path d="M9 9L12 12"/>
    <circle cx="12" cy="6" r="1" fill="currentColor"/>
  </svg>
);

export const pinTool: ToolDefinition = {
  id: 'pin',
  name: 'Pin',
  context: '3d',
  icon: PinIcon,
  cursor: 'crosshair',
  group: '3d-arrange',
  options: [
    {
      id: 'pinStrength',
      label: 'Pin Strength',
      type: 'select',
      value: 'strong',
      choices: [
        { label: 'Weak', value: 'weak' },
        { label: 'Medium', value: 'medium' },
        { label: 'Strong', value: 'strong' },
      ],
    },
  ],
  onActivate: () => {
    console.log('Pin tool - Coming soon!');
  },
  copilot: {
    description: 'Pins a point on the cloth to fix it in place during simulation. Pinned points will not move, allowing the rest of the fabric to drape naturally around them. Useful for holding garments on shoulders, waistband, or specific anchor points.',
    examples: [
      'Pin the shoulder point',
      'Fix this point in place',
      'Add a pin to hold the waistband',
      'Anchor the neckline',
    ],
    keywords: ['pin', 'fix', 'anchor', 'hold', 'constrain', 'attach', 'lock', 'tack'],
    requiresSelection: 'none',
    produces: 'simulation',
    undoable: true,
    parameterHints: {
      pinStrength: 'How strongly the pin holds the cloth. Weak allows slight movement, Strong is completely fixed.',
    },
  },
};