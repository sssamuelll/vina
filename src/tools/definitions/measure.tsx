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
  context: '2d',
  icon: MeasureIcon,
  cursor: 'crosshair',
  shortcut: 'm',
  group: 'annotation',
  options: [
    {
      id: 'units',
      label: 'Display Units',
      type: 'select',
      value: 'mm',
      choices: [
        { label: 'Millimeters', value: 'mm' },
        { label: 'Centimeters', value: 'cm' },
        { label: 'Inches', value: 'inches' },
      ],
    },
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
      'Measure the armhole circumference',
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
      'circumference',
      'metric',
    ],
    requiresSelection: 'none',
    produces: 'measurement',
    undoable: false,
    dangerous: false,
    parameterHints: {
      units: 'Display unit for measurements: millimeters, centimeters, or inches',
      showAngle: 'Whether to display angle measurements in addition to distances',
      cumulative: 'Add up multiple measurements to show total distance',
    },
  },
};