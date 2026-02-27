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
  copilot: {
    description:
      'Add grainline markings to pattern pieces. Grainlines indicate the direction of the fabric grain (warp threads) and are essential for proper fabric layout and cutting. They ensure consistent drape and stretch behavior across the garment.',
    examples: [
      'Add a grainline to this piece',
      'Mark the grain direction on the bodice',
      'Place a vertical grainline on the sleeve',
      'Set the grainline parallel to center front',
    ],
    keywords: [
      'grainline',
      'grain',
      'warp',
      'weft',
      'fabric direction',
      'layout',
      'cutting',
      'arrow',
      'alignment',
    ],
    requiresSelection: 'piece',
    produces: 'none',
    undoable: true,
    dangerous: false,
  },
};