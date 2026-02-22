import React from 'react';
import { ToolDefinition } from '../types';

const LineIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
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
    <path d="M4 14L14 4"/>
  </svg>
);

export const lineTool: ToolDefinition = {
  id: 'line',
  name: 'Line Tool',
  context: '2d',
  shortcut: 'l',
  icon: LineIcon,
  cursor: 'crosshair',
  group: 'draw',
};