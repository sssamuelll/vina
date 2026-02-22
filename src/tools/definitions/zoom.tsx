import React from 'react';
import { ToolDefinition } from '../types';

const ZoomIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
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
    <circle cx="8" cy="8" r="5"/>
    <path d="M16 16L12 12"/>
    <path d="M6 8H10"/>
    <path d="M8 6V10"/>
  </svg>
);

export const zoomTool: ToolDefinition = {
  id: 'zoom',
  name: 'Zoom',
  context: '2d',
  shortcut: 'z',
  icon: ZoomIcon,
  cursor: 'zoom-in',
  group: 'navigation',
  options: [
    {
      id: 'zoomMode',
      label: 'Zoom Mode',
      type: 'select',
      value: 'in',
      choices: [
        { label: 'Zoom In', value: 'in' },
        { label: 'Zoom Out', value: 'out' },
        { label: 'Fit to Window', value: 'fit' },
      ],
    },
  ],
};