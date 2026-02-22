import React from 'react';
import { ToolDefinition } from '../types';

const MeasureIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
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
    <path d="M3 8H15"/>
    <path d="M3 6V10M6 7V9M9 6V10M12 7V9M15 6V10"/>
  </svg>
);

export const measureTool: ToolDefinition = {
  id: 'measure',
  name: 'Measure Tool',
  context: '2d',
  shortcut: 'm',
  icon: MeasureIcon,
  cursor: 'crosshair',
  group: 'view',
  options: [
    {
      id: 'units',
      label: 'Display Units',
      type: 'select',
      value: 'mm',
      choices: [
        { label: 'Millimeters', value: 'mm' },
        { label: 'Centimeters', value: 'cm' },
        { label: 'Inches', value: 'inches' },
      ],
    },
  ],
};