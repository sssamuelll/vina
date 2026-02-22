import React from 'react';
import { ToolDefinition } from '../types';

const TransformIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
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
    <circle cx="4" cy="4" r="2"/>
    <circle cx="14" cy="4" r="2"/>
    <circle cx="4" cy="14" r="2"/>
    <circle cx="14" cy="14" r="2"/>
    <path d="M6 4H12M4 6V12M14 6V12M6 14H12"/>
  </svg>
);

export const transformTool: ToolDefinition = {
  id: 'transform',
  name: 'Transform',
  context: '2d',
  shortcut: 't',
  icon: TransformIcon,
  cursor: 'default',
  group: 'select',
  options: [
    {
      id: 'mode',
      label: 'Transform Mode',
      type: 'select',
      value: 'scale',
      choices: [
        { label: 'Scale', value: 'scale' },
        { label: 'Rotate', value: 'rotate' },
        { label: 'Skew', value: 'skew' },
      ],
    },
    {
      id: 'uniform',
      label: 'Uniform Scale',
      type: 'toggle',
      value: true,
    },
  ],
};