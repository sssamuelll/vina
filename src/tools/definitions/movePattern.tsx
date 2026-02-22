import React from 'react';
import { ToolDefinition } from '../types';

const MovePatternIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
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
    {/* Pattern piece outline */}
    <path d="M5 5L13 5L13 13L5 13Z"/>
    {/* Four-directional arrow */}
    <path d="M9 1L9 17"/>
    <path d="M1 9L17 9"/>
    <path d="M7 3L9 1L11 3"/>
    <path d="M15 7L17 9L15 11"/>
    <path d="M11 15L9 17L7 15"/>
    <path d="M3 11L1 9L3 7"/>
  </svg>
);

export const movePatternTool: ToolDefinition = {
  id: 'movePattern',
  name: 'Move Pattern',
  context: '2d',
  icon: MovePatternIcon,
  cursor: 'move',
  group: 'select',
};