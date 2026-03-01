/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import { ToolDefinition } from '../types';

const LineIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
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
    <path d="M4 14L14 4"/>
  </svg>
);

export const lineTool: ToolDefinition = {
  id: 'line',
  name: 'Line Tool',
  context: '2d',
  icon: LineIcon,
  cursor: 'crosshair',
  group: 'draw',
  copilot: {
    description:
      'Draw straight lines on the pattern workspace. Creates line segments between two points, useful for construction lines, style lines, grain lines, and other linear pattern markings.',
    examples: [
      'Draw a line from here to there',
      'Create a straight construction line',
      'Add a vertical line through the center',
      'Draw a horizontal guideline',
    ],
    keywords: [
      'line',
      'straight',
      'segment',
      'construction',
      'guide',
      'ruler',
      'edge',
      'stroke',
    ],
    requiresSelection: 'none',
    produces: 'piece',
    undoable: true,
    dangerous: false,
  },
};