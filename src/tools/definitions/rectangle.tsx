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
      id: 'cornerRadius',
      label: 'Corner Radius',
      type: 'number',
      value: 0,
      min: 0,
      max: 20,
      step: 1,
    },
  ],
};