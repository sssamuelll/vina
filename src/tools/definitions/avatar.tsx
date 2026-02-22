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
  name: 'Avatar & Measurements',
  context: '3d',
  icon: AvatarIcon,
  cursor: 'pointer',
  group: '3d-edit',
};