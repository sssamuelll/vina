/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import { ToolDefinition } from '../types';

const CompareCurvesIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
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
    {/* Solid curve */}
    <path d="M3 12C5 6 8 4 15 6" />
    {/* Dashed curve */}
    <path d="M3 14C5 8 8 6 15 8" strokeDasharray="2 2" />
  </svg>
);

export const compareCurvesTool: ToolDefinition = {
  id: 'compareCurves',
  name: 'Compare Curves',
  description: 'Compare arc lengths of two pattern edges',
  context: '2d',
  icon: CompareCurvesIcon,
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
      'Compare the arc lengths of two pattern edges to check ease and fit. Highlights the difference (delta) between two curves, useful for verifying that seam lines match or that intended ease is correctly distributed.',
    examples: [
      'Compare the armhole and sleeve cap lengths',
      'Check the ease between the side seam and lining edge',
      'What is the difference between these two curve lengths?',
    ],
    keywords: [
      'compare',
      'ease',
      'delta',
      'difference',
      'match',
      'seam length',
    ],
    requiresSelection: 'none',
    produces: 'measurement',
    undoable: false,
    dangerous: false,
    parameterHints: {
      markerInterval:
        'Distance between markers when comparing curves (mm)',
    },
  },
};
