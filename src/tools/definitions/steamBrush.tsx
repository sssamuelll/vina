import React from 'react';
import { ToolDefinition } from '../types';

const SteamBrushIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
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
    <circle cx="9" cy="12" r="5" />
    <path d="M7 5C7 3.5 8 2 9 2S11 3.5 11 5" />
    <path d="M5 6C5 4.5 6 3 7 3" />
    <path d="M11 3C12 3 13 4.5 13 6" />
  </svg>
);

export const steamBrushTool: ToolDefinition = {
  id: 'steamBrush',
  name: 'Steam Brush',
  description: 'Relax cloth by brushing — damps velocity to calm fabric movement',
  context: '3d',
  shortcut: 'b',
  icon: SteamBrushIcon,
  cursor: 'crosshair',
  group: '3d-simulation',
  options: [
    {
      id: 'brushRadius',
      label: 'Brush Radius',
      type: 'select',
      value: 'medium',
      choices: [
        { label: 'Small (2cm)', value: 'small' },
        { label: 'Medium (5cm)', value: 'medium' },
        { label: 'Large (10cm)', value: 'large' },
      ],
    },
    {
      id: 'relaxStrength',
      label: 'Strength',
      type: 'select',
      value: 'medium',
      choices: [
        { label: 'Light', value: 'light' },
        { label: 'Medium', value: 'medium' },
        { label: 'Strong', value: 'strong' },
      ],
    },
  ],
  onActivate: () => {
    console.log('[Steam Brush] Activated — click and drag on cloth to relax');
  },
  copilot: {
    description: 'Steam brush tool relaxes cloth particles by damping their velocity. Click and drag on the garment surface to calm fabric movement in that area, simulating steam pressing.',
    examples: [
      'Use the steam brush on the wrinkled area',
      'Smooth out the fabric',
      'Press the collar flat',
    ],
    keywords: ['steam', 'press', 'brush', 'smooth', 'relax', 'calm', 'iron', 'flatten'],
    requiresSelection: 'none',
    produces: 'simulation',
    undoable: false,
  },
};
