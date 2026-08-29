/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import { ToolDefinition } from '../types';

const PenIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
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
    <path d="M12 2L16 6L6 16L2 16L2 12L12 2Z"/>
    <path d="M11 3L15 7"/>
  </svg>
);

export const penTool: ToolDefinition = {
  id: 'pen',
  name: 'Pluma',
  description: 'Draw custom pattern shapes point by point',
  context: '2d',
  shortcut: 'h',
  icon: PenIcon,
  cursor: 'crosshair',
  group: 'draw',
  copilot: {
    description: 'Draw custom pattern pieces by placing points. Click to place corner points, drag to create curved segments. Double-click or press Enter to close the shape and create a new pattern piece.',
    examples: [
      'Draw a collar shape',
      'Create a pocket piece',
      'Sketch a custom yoke',
      'Draw a facing pattern',
    ],
    keywords: ['draw', 'sketch', 'create', 'pen', 'path', 'shape', 'freeform', 'custom'],
    requiresSelection: 'none',
    produces: 'piece',
    undoable: true,
  },
};