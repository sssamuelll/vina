/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import { ToolDefinition } from '../types';

const DartIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
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
    {/* Dart shape: V pointing inward from edge */}
    <path d="M4 3L9 10L14 3" />
    <path d="M4 3H14" strokeDasharray="2 2" />
    <circle cx="9" cy="10" r="1" fill="currentColor" />
  </svg>
);

export const dartTool: ToolDefinition = {
  id: 'dart',
  name: 'Dart',
  context: '2d',
  shortcut: 'd',
  icon: DartIcon,
  cursor: 'crosshair',
  group: 'draw',
  options: [
    {
      id: 'dartWidth',
      label: 'Width (mm)',
      type: 'number',
      value: 20,
      min: 5,
      max: 80,
      step: 1,
    },
    {
      id: 'dartDepth',
      label: 'Depth (mm)',
      type: 'number',
      value: 100,
      min: 20,
      max: 300,
      step: 5,
    },
    {
      id: 'capShape',
      label: 'Cap Shape',
      type: 'select',
      value: 'pointed',
      choices: [
        { label: 'Pointed', value: 'pointed' },
        { label: 'Curved', value: 'curved' },
        { label: 'Flat', value: 'flat' },
        { label: 'Diamond', value: 'diamond' },
      ],
    },
    {
      id: 'segments',
      label: 'Segments',
      type: 'number',
      value: 1,
      min: 1,
      max: 6,
      step: 1,
    },
  ],
  copilot: {
    description:
      'Add darts to pattern pieces for shaping and fitting. Darts are triangular tucks sewn into fabric to provide three-dimensional shape, commonly used at bust, waist, and shoulder areas to create fitted garments.',
    examples: [
      'Add a dart to this bodice piece',
      'Create a bust dart with 25mm width',
      'Insert a waist dart 120mm deep',
      'Place a dart on the selected edge',
    ],
    keywords: [
      'dart',
      'tuck',
      'shaping',
      'fitting',
      'bust dart',
      'waist dart',
      'shoulder dart',
      'contour',
      'tailoring',
      'segment dart',
      'dart cap',
      'split dart',
      'distribute dart',
    ],
    requiresSelection: 'piece',
    produces: 'piece',
    undoable: true,
    dangerous: false,
    parameterHints: {
      dartWidth: 'Width of the dart opening at the edge in millimeters',
      dartDepth: 'How deep the dart extends into the pattern piece in millimeters',
      capShape:
        'Shape of the dart tip: pointed (default V), curved (rounded), flat (blunt), diamond (faceted)',
      segments:
        'Number of darts to split into (1 = no split, 2-6 = distribute intake across multiple darts)',
    },
  },
};
