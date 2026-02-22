import React from 'react';
import { ToolDefinition } from '../types';

const HandIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
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
    <path 
      d="M6.5 1.5V9M6.5 1.5C6.5 0.67 7.17 0 8 0S9.5 0.67 9.5 1.5V7M9.5 1.5C9.5 0.67 10.17 0 11 0S12.5 0.67 12.5 1.5V7M12.5 3C12.5 2.17 13.17 1.5 14 1.5S15.5 2.17 15.5 3V10C15.5 13.04 13.04 15.5 10 15.5H9C6.5 15.5 4.5 14.5 3.5 13L1 8.5C0.5 7.67 0.83 6.58 1.67 6.08C2.5 5.58 3.58 5.92 4.08 6.75L5 8.25V2.5C5 1.67 5.67 1 6.5 1Z" 
      strokeLinejoin="round"
    />
  </svg>
);

export const handTool: ToolDefinition = {
  id: 'hand',
  name: 'Hand/Pan',
  context: '2d',
  shortcut: 'h',
  icon: HandIcon,
  cursor: 'grab',
  group: 'navigation',
};