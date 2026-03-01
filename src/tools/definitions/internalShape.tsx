/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import { ToolDefinition } from '../types';

const InternalShapeIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 18 18" 
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeDasharray="2 2"
  >
    {/* Dashed rectangle outline */}
    <rect x="3" y="3" width="12" height="12"/>
  </svg>
);

export const internalShapeTool: ToolDefinition = {
  id: 'internalShape',
  name: 'Internal Shape',
  context: '2d',
  shortcut: 'g',
  icon: InternalShapeIcon,
  cursor: 'crosshair',
  group: 'draw',
  copilot: {
    description: 'Creates internal cutouts or holes within a pattern piece. Used for adding buttonholes, pocket openings, decorative cutouts, or other internal shapes that need to be cut out of the fabric. The internal shape becomes a hole in the pattern piece.',
    examples: [
      'Add a buttonhole cutout',
      'Create an internal pocket opening',
      'Draw a cutout shape',
      'Add a decorative hole',
    ],
    keywords: ['internal', 'cutout', 'hole', 'opening', 'buttonhole', 'pocket', 'shape', 'cut'],
    requiresSelection: 'piece',
    produces: 'piece',
    undoable: true,
  },
};