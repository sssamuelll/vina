/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import { ToolDefinition } from '../types';

const ZoomIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
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
    <circle cx="8" cy="8" r="5"/>
    <path d="M16 16L12 12"/>
    <path d="M6 8H10"/>
    <path d="M8 6V10"/>
  </svg>
);

export const zoomTool: ToolDefinition = {
  id: 'zoom',
  name: 'Zoom',
  context: '2d',
  icon: ZoomIcon,
  cursor: 'zoom-in',
  group: 'navigation',
  options: [
    {
      id: 'zoomMode',
      label: 'Zoom Mode',
      type: 'select',
      value: 'in',
      choices: [
        { label: 'Zoom In', value: 'in' },
        { label: 'Zoom Out', value: 'out' },
        { label: 'Fit to Window', value: 'fit' },
      ],
    },
  ],
  copilot: {
    description: 'Zoom the 2D view in or out to adjust magnification level. Click to zoom in at that location, or use Fit to Window to see all pattern pieces at once. Hold Alt/Option while clicking to zoom out. Scroll wheel also zooms when this tool is active.',
    examples: [
      'Zoom in on the collar',
      'Zoom out to see all pieces',
      'Fit the pattern to the window',
      'Magnify this area',
    ],
    keywords: ['zoom', 'magnify', 'enlarge', 'fit', 'scale view', 'zoom in', 'zoom out', 'view size'],
    requiresSelection: 'none',
    produces: 'view',
    undoable: false,
    parameterHints: {
      zoomMode: 'Zoom In increases magnification, Zoom Out decreases, Fit to Window shows entire pattern',
    },
  },
};