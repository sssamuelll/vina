import React from 'react';
import { ToolDefinition } from '../types';

const FreeSewingIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
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
    <path d="M3 6L15 12"/>
    <path d="M6 3L12 15"/>
    <path d="M3 6L6 3M12 15L15 12"/>
    <circle cx="6" cy="6" r="1"/>
    <circle cx="12" cy="12" r="1"/>
  </svg>
);

export const freeSewingTool: ToolDefinition = {
  id: 'freesewing',
  name: 'Free Sewing',
  context: '2d',
  icon: FreeSewingIcon,
  cursor: 'crosshair',
  group: 'sewing',
  options: [
    {
      id: 'sewingType',
      label: 'Sewing Type',
      type: 'select',
      value: 'free',
      choices: [
        { label: 'Free', value: 'free' },
        { label: 'Point-to-Point', value: 'point' },
      ],
    },
  ],
  onActivate: () => {
    console.log('Free Sewing tool - Coming soon!');
  },
};