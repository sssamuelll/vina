import React from 'react';
import { ToolDefinition } from '../types';

const MeshGrabIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
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
    {/* Open hand / grab gesture */}
    <path d="M9 14V8" />
    <path d="M7 14V7" />
    <path d="M11 14V7" />
    <path d="M5 14V9" />
    <path d="M13 14V9" />
    <path d="M5 14H13C14 14 15 13 15 12V9C15 8 14 7 13 7" />
    <path d="M5 14H5C4 14 3 13 3 12V9C3 8 4 7 5 7" />
  </svg>
);

export const meshGrabTool: ToolDefinition = {
  id: 'meshGrab',
  name: 'Mesh Grab',
  description: 'Grab and pull fabric during simulation — drag cloth to reposition',
  context: '3d',
  shortcut: 'o',
  icon: MeshGrabIcon,
  cursor: 'grab',
  group: '3d-simulation',
  options: [
    {
      id: 'brushRadius',
      label: 'Brush Radius',
      type: 'select',
      value: 'medium',
      choices: [
        { label: 'Small (3cm)', value: 'small' },
        { label: 'Medium (8cm)', value: 'medium' },
        { label: 'Large (15cm)', value: 'large' },
      ],
    },
    {
      id: 'grabStrength',
      label: 'Strength',
      type: 'select',
      value: 'medium',
      choices: [
        { label: 'Light (0.3)', value: 'light' },
        { label: 'Medium (0.6)', value: 'medium' },
        { label: 'Strong (0.9)', value: 'strong' },
      ],
    },
  ],
  onActivate: () => {
    console.log('[Mesh Grab] Activated — click and drag on cloth to pull');
  },
  copilot: {
    description: 'Mesh grab tool lets you grab and pull fabric during simulation. Click and drag on the garment surface to reposition cloth, simulating manual garment manipulation.',
    examples: [
      'Grab the sleeve and pull it down',
      'Move the fabric into position',
      'Drag the hem to adjust the drape',
    ],
    keywords: ['grab', 'pull', 'move', 'mesh', 'drag', 'knead'],
    requiresSelection: 'none',
    produces: 'simulation',
    undoable: false,
  },
};
