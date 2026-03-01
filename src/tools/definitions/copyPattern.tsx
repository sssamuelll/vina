/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import { ToolDefinition } from '../types';

const CopyPatternIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
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
    {/* Back rectangle */}
    <path d="M4 4L12 4L12 12L4 12Z"/>
    {/* Front rectangle (overlapping) */}
    <path d="M6 6L14 6L14 14L6 14Z"/>
  </svg>
);

export const copyPatternTool: ToolDefinition = {
  id: 'copyPattern',
  name: 'Copy Pattern',
  context: '2d',
  icon: CopyPatternIcon,
  cursor: 'default',
  group: 'pattern',
  copilot: {
    description: 'Copies the selected pattern piece to create a duplicate. The copy can be placed elsewhere and modified independently. Useful for creating symmetric pieces (left/right) or variations of an existing pattern.',
    examples: [
      'Copy this pattern piece',
      'Duplicate the sleeve',
      'Make a copy of the front bodice',
      'Clone the selected piece',
    ],
    keywords: ['copy', 'duplicate', 'clone', 'replicate', 'pattern', 'piece'],
    requiresSelection: 'piece',
    produces: 'piece',
    undoable: true,
  },
};