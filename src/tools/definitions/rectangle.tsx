/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import { ToolDefinition } from '../types';

const RectangleIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
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
    <rect x="3" y="5" width="12" height="8"/>
  </svg>
);

export const rectangleTool: ToolDefinition = {
  id: 'rectangle',
  name: 'Rectángulo',
  context: '2d',
  shortcut: 's',
  icon: RectangleIcon,
  cursor: 'crosshair',
  group: 'draw',
  options: [
    {
      id: 'width',
      label: 'Width',
      type: 'number',
      value: 100,
      min: 10,
      max: 1000,
      step: 5,
    },
    {
      id: 'height',
      label: 'Height',
      type: 'number',
      value: 100,
      min: 10,
      max: 1000,
      step: 5,
    },
    {
      id: 'cornerStyle',
      label: 'Corner Style',
      type: 'select',
      value: 'square',
      choices: [
        { label: 'Square', value: 'square' },
        { label: 'Rounded', value: 'rounded' },
        { label: 'Chamfered', value: 'chamfered' },
      ],
    },
  ],
  copilot: {
    description:
      'Draw rectangular pattern pieces or shapes. Creates four-sided shapes with perpendicular corners, useful for basic pattern blocks, pockets, facings, and other rectangular pattern elements.',
    examples: [
      'Draw a rectangle 100mm by 150mm',
      'Create a square pocket piece',
      'Make a rectangular facing with rounded corners',
      'Add a 200x300mm pattern block',
    ],
    keywords: [
      'rectangle',
      'square',
      'box',
      'shape',
      'block',
      'pocket',
      'facing',
      'panel',
      'four-sided',
    ],
    requiresSelection: 'none',
    produces: 'piece',
    undoable: true,
    dangerous: false,
    parameterHints: {
      width: 'Width of the rectangle in millimeters',
      height: 'Height of the rectangle in millimeters',
      cornerStyle: 'Corner treatment: square, rounded, or chamfered (angled)',
    },
  },
};