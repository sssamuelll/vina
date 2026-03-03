/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import { ToolDefinition } from '../types';

const EditPatternIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
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
    {/* Polygon outline */}
    <path d="M3 14L9 3L15 14Z" />
    {/* Node dots at corners — filled squares for edit pattern */}
    <rect x="7.5" y="1.5" width="3" height="3" fill="currentColor" />
    <rect x="13.5" y="12.5" width="3" height="3" fill="currentColor" />
    <rect x="1.5" y="12.5" width="3" height="3" fill="currentColor" />
  </svg>
);

export const editPatternTool: ToolDefinition = {
  id: 'editPattern',
  name: 'Edit Pattern',
  context: '2d',
  shortcut: 'z',
  icon: EditPatternIcon,
  cursor: 'default',
  group: 'select',
  copilot: {
    description: 'Select and edit individual points and segments on pattern piece edges. Click points to select, shift+click to multi-select, drag to move. Delete points with backspace/delete. Click on an edge to add a point. Right-click a segment to convert between line and curve.',
    examples: [
      'Edit the points on the front bodice',
      'Delete the extra point on the waistline',
      'Add a point at the hip notch location',
      'Convert the armhole segment to a curve',
    ],
    keywords: ['edit', 'pattern', 'points', 'segments', 'select', 'move', 'delete', 'add'],
    requiresSelection: 'piece',
    produces: 'point',
    undoable: true,
  },
};
