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
  name: 'Pen Tool',
  description: 'Draw custom pattern shapes point by point',
  context: '2d',
  shortcut: 'h',
  icon: PenIcon,
  cursor: 'crosshair',
  group: 'draw',
  options: [
    {
      id: 'smoothing',
      label: 'Smoothing',
      type: 'toggle',
      value: true,
    },
    {
      id: 'snapGrid',
      label: 'Snap to Grid',
      type: 'toggle',
      value: false,
    },
    {
      id: 'constrainAngles',
      label: 'Constrain Angles',
      type: 'select',
      value: 'none',
      choices: [
        { label: 'None', value: 'none' },
        { label: '45°', value: '45' },
        { label: '90°', value: '90' },
      ],
    },
  ],
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
    parameterHints: {
      smoothing: 'Automatically smooth corners into curves',
      snapGrid: 'Snap points to the grid for precise placement',
      constrainAngles: 'Lock lines to 45° or 90° angles',
    },
  },
};