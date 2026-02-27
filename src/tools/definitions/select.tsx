import React from 'react';
import { ToolDefinition } from '../types';

const SelectIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
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
    <path d="M3 3L15 9L9 15L3 3Z" fill="currentColor" fillOpacity="0.2"/>
    <path d="M3 3L15 9L9 15L3 3Z"/>
  </svg>
);

export const selectTool: ToolDefinition = {
  id: 'select',
  name: 'Select/Move',
  description: 'Select and move pattern pieces, points, or edges',
  context: '2d',
  shortcut: 'v',
  icon: SelectIcon,
  cursor: 'default',
  group: 'select',
  copilot: {
    description: 'Select pattern pieces, points, or edges for editing. Click to select single items, drag to marquee select multiple. Hold Shift to add to selection. Selected items can be moved by dragging.',
    examples: [
      'Select the front bodice',
      'Select all sleeve pieces',
      'Click on the shoulder point',
      'Select the neckline edge',
    ],
    keywords: ['select', 'pick', 'choose', 'click', 'move', 'drag', 'highlight'],
    requiresSelection: 'none',
    produces: 'none',
    undoable: true,
  },
};