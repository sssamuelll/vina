/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import React from 'react';
import { ToolDefinition } from '../types';

const AvatarIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
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
    <circle cx="9" cy="5" r="3" />
    <path d="M3 17C3 13.69 5.69 11 9 11C12.31 11 15 13.69 15 17" />
  </svg>
);

export const avatarTool: ToolDefinition = {
  id: 'avatar',
  name: 'Avatar',
  context: '3d',
  icon: AvatarIcon,
  cursor: 'pointer',
  group: '3d-avatar',
  copilot: {
    description: 'Opens avatar settings to configure the 3D mannequin or body model used for garment simulation. Allows changing body measurements, proportions, and selecting different avatar presets.',
    examples: [
      'Open avatar settings',
      'Change the mannequin',
      'Adjust body measurements',
      'Switch to a different body type',
    ],
    keywords: ['avatar', 'mannequin', 'body', 'model', 'measurements', 'figure', 'dummy', 'form'],
    requiresSelection: 'none',
    produces: 'view',
    undoable: false,
  },
};