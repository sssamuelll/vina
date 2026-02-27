import React from 'react';
import { ToolDefinition } from '../types';

const Edit3DIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
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
    <path d="M3 3L15 9L9 15L3 3Z" fill="currentColor" fillOpacity="0.2" />
    <path d="M3 3L15 9L9 15L3 3Z" />
  </svg>
);

export const edit3dTool: ToolDefinition = {
  id: 'edit',
  name: 'Edit Mode',
  context: '3d',
  icon: Edit3DIcon,
  cursor: 'pointer',
  group: '3d-edit',
  copilot: {
    description: 'Enters 3D edit mode for manipulating cloth and pattern pieces in the 3D viewport. Allows selecting, moving, rotating, and adjusting garment pieces directly on the avatar. Changes made in 3D can be reflected back to the 2D pattern.',
    examples: [
      'Enter 3D edit mode',
      'Edit the garment in 3D',
      'Adjust the fit on the avatar',
      'Move the pattern piece in 3D',
    ],
    keywords: ['edit', '3d', 'manipulate', 'adjust', 'move', 'transform', 'fit', 'drape'],
    requiresSelection: 'none',
    produces: 'view',
    undoable: true,
  },
};