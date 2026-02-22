import React from 'react';
import { ToolDefinition } from '../types';

const PenIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
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
    <path d="M12 2L16 6L6 16L2 16L2 12L12 2Z"/>
    <path d="M11 3L15 7"/>
  </svg>
);

export const penTool: ToolDefinition = {
  id: 'pen',
  name: 'Pen Tool',
  context: '2d',
  shortcut: 'p',
  icon: PenIcon,
  cursor: 'crosshair',
  group: 'draw',
  options: [
    {
      id: 'smoothing',
      label: 'Stroke Smoothing',
      type: 'toggle',
      value: true,
    },
    {
      id: 'snapAngle',
      label: 'Snap to Angle',
      type: 'number',
      value: 15,
      min: 0,
      max: 45,
      step: 5,
    },
  ],
};