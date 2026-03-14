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
      id: 'measureMode',
      label: 'Mode',
      type: 'select',
      value: 'point-to-point',
      choices: [
        { label: 'Point to Point', value: 'point-to-point' },
        { label: 'Along Curve', value: 'along-curve' },
        { label: 'Compare Curves', value: 'compare' },
      ],
    },
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
    {
      id: 'markerInterval',
      label: 'Marker Interval',
      type: 'select',
      value: '50',
      choices: [
        { label: '25mm', value: '25' },
        { label: '50mm', value: '50' },
        { label: '100mm', value: '100' },
      ],
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
      'Measure the armhole length along the curve',
      'Compare the armhole and sleeve cap lengths',
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
      'curve',
      'arc length',
      'along',
      'walk',
      'compare',
      'ease',
      'seam length',
    ],
    requiresSelection: 'none',
    produces: 'measurement',
    undoable: false,
    dangerous: false,
    parameterHints: {
      units: 'Display unit for measurements: millimeters, centimeters, or inches',
      showAngle: 'Whether to display angle measurements in addition to distances',
      cumulative: 'Add up multiple measurements to show total distance',
      measureMode: 'Measurement mode: point-to-point for straight distances, along-curve for arc length, compare for two edges',
      markerInterval: 'Distance between markers when measuring along a curve (mm)',
    },
  },
};