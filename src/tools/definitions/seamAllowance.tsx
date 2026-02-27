import React from 'react';
import { ToolDefinition } from '../types';

const SeamAllowanceIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
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
    {/* Shield outline */}
    <path d="M9 2L15 5L15 11C15 14 9 16 9 16C9 16 3 14 3 11L3 5Z"/>
    {/* Inner shape */}
    <path d="M9 4L13 6L13 10C13 12 9 13 9 13C9 13 5 12 5 10L5 6Z"/>
  </svg>
);

export const seamAllowanceTool: ToolDefinition = {
  id: 'seamAllowance',
  name: 'Seam Allowance',
  context: '2d',
  icon: SeamAllowanceIcon,
  cursor: 'default',
  group: 'pattern',
  copilot: {
    description:
      'Add seam allowance to pattern pieces. Seam allowance is the extra fabric beyond the stitch line that allows pieces to be sewn together. Different edges may require different allowance widths depending on seam type and finishing method.',
    examples: [
      'Add 1cm seam allowance to this piece',
      'Apply seam allowance to all edges',
      'Set 1.5cm allowance on the hem',
      'Add seam allowance except on the fold line',
    ],
    keywords: [
      'seam allowance',
      'seam',
      'allowance',
      'margin',
      'offset',
      'sewing margin',
      'hem allowance',
      'buffer',
    ],
    requiresSelection: 'piece',
    produces: 'piece',
    undoable: true,
    dangerous: false,
  },
};