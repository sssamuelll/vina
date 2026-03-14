/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import { ToolDefinition } from '../types';

const MeasureIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
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
    <path d="M3 8H15"/>
    <path d="M3 6V10M6 7V9M9 6V10M12 7V9M15 6V10"/>
  </svg>
);

export const measureTool: ToolDefinition = {
  id: 'measure',
  name: 'Measure',
  description: 'Measure point-to-point distances on pattern pieces',
  context: '2d',
  icon: MeasureIcon,
  cursor: 'crosshair',
  shortcut: 'm',
  group: 'annotation',
  options: [
    {
      id: 'showAngle',
      label: 'Show Angle',
      type: 'toggle',
      value: false,
    },
    {
      id: 'cumulative',
      label: 'Cumulative Distance',
      type: 'toggle',
      value: false,
    },
  ],
  copilot: {
    description:
      'Measure distances, lengths, and angles on pattern pieces. Provides precise measurements between points, along edges, or across pattern areas. Essential for verifying pattern accuracy and ensuring proper fit.',
    examples: [
      'Measure the length of this edge',
      'What is the distance between these two points?',
      'Show me the waist measurement',
    ],
    keywords: [
      'measure',
      'distance',
      'length',
      'ruler',
      'tape',
      'dimension',
      'size',
      'angle',
      'metric',
    ],
    requiresSelection: 'none',
    produces: 'measurement',
    undoable: false,
    dangerous: false,
    parameterHints: {
      showAngle: 'Whether to display angle measurements in addition to distances',
      cumulative: 'Add up multiple measurements to show total distance',
    },
  },
};