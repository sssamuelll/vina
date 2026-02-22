import React from 'react';
import { ToolDefinition } from '../types';

const SeamIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
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
    <path d="M6 3V15M12 3V15"/>
    <path d="M6 6L12 6M6 9L12 9M6 12L12 12" strokeWidth="1"/>
  </svg>
);

export const seamTool: ToolDefinition = {
  id: 'seam',
  name: 'Seam',
  context: '2d',
  shortcut: 's',
  icon: SeamIcon,
  cursor: 'pointer',
  group: 'sewing',
  options: [
    {
      id: 'seamType',
      label: 'Seam Type',
      type: 'select',
      value: 'standard',
      choices: [
        { label: 'Standard', value: 'standard' },
        { label: 'French', value: 'french' },
        { label: 'Flat-Felled', value: 'flat-felled' },
        { label: 'Overlock', value: 'overlock' },
      ],
    },
    {
      id: 'stitchLength',
      label: 'Stitch Length',
      type: 'number',
      value: 2.5,
      min: 1.0,
      max: 6.0,
      step: 0.1,
    },
  ],
};