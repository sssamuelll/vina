import React from 'react';
import { ToolDefinition } from '../types';

const FlattenIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
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
    {/* Iron base */}
    <path d="M2 12L14 12L12 8L4 8Z"/>
    {/* Iron handle */}
    <path d="M12 8L12 6L10 6"/>
    {/* Steam dots */}
    <circle cx="6" cy="10" r="0.5" fill="currentColor"/>
    <circle cx="8" cy="10" r="0.5" fill="currentColor"/>
    <circle cx="10" cy="10" r="0.5" fill="currentColor"/>
  </svg>
);

export const flattenTool: ToolDefinition = {
  id: 'flatten',
  name: 'Flatten',
  context: '2d',
  icon: FlattenIcon,
  cursor: 'default',
  group: 'pattern',
};