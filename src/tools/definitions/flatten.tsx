/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import React from 'react';
import { ToolDefinition } from '../types';

const FlattenIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
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
    {/* Iron base */}
    <path d="M2 12L14 12L12 8L4 8Z"/>
    {/* Iron handle */}
    <path d="M12 8L12 6L10 6"/>
    {/* Steam dots */}
    <circle cx="6" cy="10" r="0.5" fill="currentColor"/>
    <circle cx="8" cy="10" r="0.5" fill="currentColor"/>
    <circle cx="10" cy="10" r="0.5" fill="currentColor"/>
  </svg>
);

export const flattenTool: ToolDefinition = {
  id: 'flatten',
  name: 'Flatten',
  context: '2d',
  icon: FlattenIcon,
  cursor: 'default',
  group: 'pattern',
  copilot: {
    description: 'Flattens a 3D draped garment piece back to a 2D pattern. Captures the deformed shape from simulation and converts it to a flat pattern piece. Useful for pattern adjustment after fitting on the avatar or extracting patterns from 3D designs.',
    examples: [
      'Flatten the draped piece to 2D',
      'Convert 3D shape to pattern',
      'Extract flat pattern from simulation',
      'Flatten the garment piece',
    ],
    keywords: ['flatten', '2d', 'flat', 'unwrap', 'extract', 'pattern', 'unfold'],
    requiresSelection: 'piece',
    produces: 'piece',
    undoable: true,
  },
};