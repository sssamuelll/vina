/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import { ToolDefinition } from '../types';

const MergeIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
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
    <rect x="1" y="4" width="7" height="10" rx="1" />
    <rect x="10" y="4" width="7" height="10" rx="1" />
    <path d="M8 9L10 9" strokeWidth={2} />
  </svg>
);

export const mergeTool: ToolDefinition = {
  id: 'merge',
  name: 'Unir patrones',
  context: '2d',
  shortcut: 'j',
  icon: MergeIcon,
  cursor: 'default',
  group: 'pattern',
  copilot: {
    description:
      'Merge two adjacent pattern pieces into one piece. Select the first piece, then the second piece. The pieces must share an adjacent edge. The shared edge is removed and the outlines are combined.',
    examples: [
      'Merge the upper and lower bodice pieces',
      'Join these two pattern pieces together',
      'Combine the front panels into one piece',
    ],
    keywords: ['merge', 'join', 'combine', 'unite', 'connect', 'fuse'],
    requiresSelection: 'piece',
    produces: 'piece',
    undoable: true,
  },
};
