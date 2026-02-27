import React from 'react';
import { ToolDefinition } from '../types';

const CameraIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
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
    <circle cx="9" cy="9" r="6" />
    <circle cx="9" cy="9" r="2" />
    <path d="M9 3V1M9 17V15M3 9H1M17 9H15" />
  </svg>
);

export const cameraTool: ToolDefinition = {
  id: 'camera',
  name: 'Camera',
  description: 'Orbit, pan and zoom the 3D viewport',
  context: '3d',
  icon: CameraIcon,
  cursor: 'grab',
  group: '3d-navigate',
};