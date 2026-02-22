import React from 'react';
import { ToolDefinition } from '../types';

const PoseIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
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
    <circle cx="9" cy="3.5" r="2" />
    <path d="M9 5.5V11" />
    <path d="M5 7.5L9 6.5L13 7.5" />
    <path d="M6.5 16L9 11L11.5 16" />
  </svg>
);

export const poseTool: ToolDefinition = {
  id: 'pose',
  name: 'Pose (drag joints)',
  context: '3d',
  icon: PoseIcon,
  cursor: 'pointer',
  group: '3d-edit',
  options: [
    {
      id: 'sensitivity',
      label: 'Sensitivity (°/px)',
      type: 'number',
      value: 0.5,
      min: 0.1,
      max: 2.0,
      step: 0.1,
    },
  ],
};