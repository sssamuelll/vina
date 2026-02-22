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
};