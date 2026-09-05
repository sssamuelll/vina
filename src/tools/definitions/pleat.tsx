/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import { ToolDefinition } from '../types';

const PleatIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    {/* Zigzag pleat lines */}
    <path d="M3 3V15M7 3V15M11 3V15M15 3V15"/>
    <path d="M3 9H7M11 9H15" strokeDasharray="2 1"/>
  </svg>
);

export const pleatTool: ToolDefinition = {
  id: 'pleat',
  name: 'Pliegue',
  context: '2d',
  icon: PleatIcon,
  cursor: 'crosshair',
  group: 'construction',
  copilot: {
    description: 'Create pleats (knife, box, accordion, inverted box) along a piece edge. Select an edge to add pleats with configurable depth, spacing, and count.',
    examples: [
      'Add accordion pleats to the skirt hemline',
      'Create box pleats on the waistband',
      'Add knife pleats with 15mm depth',
    ],
    keywords: ['pleat', 'knife pleat', 'box pleat', 'accordion', 'fold', 'crease', 'fullness'],
    requiresSelection: 'edge',
    produces: 'piece',
    undoable: true,
  },
};
