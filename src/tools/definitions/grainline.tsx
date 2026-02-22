import React from 'react';
import { ToolDefinition } from '../types';

const GrainlineIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
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
    <path d="M9 2V16"/>
    <path d="M6 5L9 2L12 5"/>
    <path d="M6 13L9 16L12 13"/>
  </svg>
);

export const grainlineTool: ToolDefinition = {
  id: 'grainline',
  name: 'Grainline',
  context: '2d',
  shortcut: 'g',
  icon: GrainlineIcon,
  cursor: 'pointer',
  group: 'annotation',
};