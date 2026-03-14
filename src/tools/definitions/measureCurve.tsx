/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import { ToolDefinition } from '../types';

const MeasureCurveIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
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
    {/* Curved path */}
    <path d="M3 13C5 5 13 5 15 13" />
    {/* Tick marks along the curve */}
    <path d="M4.2 9.5L3.5 10.8" />
    <path d="M6.5 7L6 8.5" />
    <path d="M9 6L9 7.5" />
    <path d="M11.5 7L12 8.5" />
    <path d="M13.8 9.5L14.5 10.8" />
  </svg>
);

export const measureCurveTool: ToolDefinition = {
  id: 'measureCurve',
  name: 'Measure Along Curve',
  description: 'Measure arc length along a pattern edge',
  context: '2d',
  icon: MeasureCurveIcon,
  cursor: 'crosshair',
  shortcut: 'm',
  group: 'annotation',
  options: [
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
      'Measure arc length along pattern edges. Walks a curve or edge and reports total arc length with optional interval markers. Useful for verifying seam lengths, armhole curves, and any non-straight edge measurements.',
    examples: [
      'Measure this edge along the curve',
      'What is the arc length of the armhole?',
      'Walk the sleeve cap and tell me the seam length',
    ],
    keywords: [
      'curve',
      'arc length',
      'along',
      'walk',
      'edge length',
      'seam length',
    ],
    requiresSelection: 'none',
    produces: 'measurement',
    undoable: false,
    dangerous: false,
    parameterHints: {
      markerInterval:
        'Distance between markers when measuring along a curve (mm)',
    },
  },
};
