/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import { ToolDefinition } from '../types';

const EditCurveIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
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
    {/* Triangle outline */}
    <path d="M9 2L16 14L2 14Z"/>
    {/* Node dots at corners */}
    <circle cx="9" cy="2" r="1.5" fill="currentColor"/>
    <circle cx="16" cy="14" r="1.5" fill="currentColor"/>
    <circle cx="2" cy="14" r="1.5" fill="currentColor"/>
  </svg>
);

export const editCurveTool: ToolDefinition = {
  id: 'editCurve',
  name: 'Edit Curve Points',
  context: '2d',
  shortcut: 'v',
  icon: EditCurveIcon,
  cursor: 'crosshair',
  group: 'select',
  copilot: {
    description: 'Edit individual control points and curve handles on pattern piece edges. Click points to select them, drag to reposition. Adjust bezier handles to control curve smoothness and direction. Add new points by clicking on edges, delete points with backspace/delete key.',
    examples: [
      'Edit the curve points on the neckline',
      'Adjust the armhole curve',
      'Move the shoulder point higher',
      'Smooth out the hip curve',
    ],
    keywords: ['edit', 'curve', 'points', 'nodes', 'bezier', 'handles', 'anchor', 'control points', 'reshape'],
    requiresSelection: 'piece',
    produces: 'point',
    undoable: true,
  },
};