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
    description: 'Add internal reference markings to pattern pieces. Internal shapes are guide lines or marks drawn on the piece that are printed and exported but not cut—the fabric stays whole. Used to mark pocket placement, internal references, placement guides, and other fabrication notes.',
    examples: [
      'Mark the pocket placement on the bodice',
      'Draw an internal reference line',
      'Add a placement guide for construction',
      'Mark internal fabrication details',
    ],
    keywords: ['internal', 'marking', 'reference', 'guide', 'placement', 'pocket', 'line', 'fabrication'],
    requiresSelection: 'piece',
    produces: 'none',
    undoable: true,
  },
};