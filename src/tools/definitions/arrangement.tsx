import React from 'react';
import { ToolDefinition } from '../types';

const ArrangementIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
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
    <circle cx="9" cy="7" r="3"/>
    <path d="M4 13H14"/>
    <path d="M6 15H12"/>
    <circle cx="4" cy="4" r="1"/>
    <circle cx="14" cy="4" r="1"/>
    <circle cx="4" cy="10" r="1"/>
    <circle cx="14" cy="10" r="1"/>
  </svg>
);

export const arrangementTool: ToolDefinition = {
  id: 'arrangement',
  name: 'Arrangement Points',
  description: 'Position pattern pieces on the avatar before simulation',
  context: '3d',
  shortcut: 'a',
  icon: ArrangementIcon,
  cursor: 'pointer',
  group: '3d-arrange',
  options: [
    {
      id: 'snapToBody',
      label: 'Snap to Body',
      type: 'toggle',
      value: true,
    },
    {
      id: 'autoArrange',
      label: 'Auto Arrange',
      type: 'toggle',
      value: false,
    },
  ],
  onActivate: () => {
    console.log('Arrangement Points tool - Coming soon!');
  },
  copilot: {
    description: 'Position flat pattern pieces around the avatar body before running cloth simulation. Drag arrangement anchor points on the avatar to specify where each piece should be placed. The simulation will then drape the pieces onto the body.',
    examples: [
      'Arrange the pieces on the body',
      'Position the front bodice on the chest',
      'Move the sleeve to the arm',
      'Auto-arrange all pieces',
    ],
    keywords: ['arrange', 'position', 'place', 'layout', 'setup', 'anchor', 'drape'],
    requiresSelection: 'none',
    produces: 'none',
    undoable: true,
    parameterHints: {
      snapToBody: 'Automatically snap pieces to the nearest body surface',
      autoArrange: 'Let the system automatically position pieces based on seam connections',
    },
  },
};