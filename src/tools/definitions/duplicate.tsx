import React from 'react';
import { ToolDefinition } from '../types';

const DuplicateIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
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
    {/* Back rectangle (offset) */}
    <path d="M3 3L11 3L11 11L3 11Z"/>
    {/* Front rectangle (offset) */}
    <path d="M7 7L15 7L15 15L7 15Z"/>
  </svg>
);

export const duplicateTool: ToolDefinition = {
  id: 'duplicate',
  name: 'Duplicate',
  context: '2d',
  shortcut: 'd',
  icon: DuplicateIcon,
  cursor: 'default',
  group: 'pattern',
};