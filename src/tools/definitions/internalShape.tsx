import React from 'react';
import { ToolDefinition } from '../types';

const InternalShapeIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 18 18" 
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeDasharray="2 2"
  >
    {/* Dashed rectangle outline */}
    <rect x="3" y="3" width="12" height="12"/>
  </svg>
);

export const internalShapeTool: ToolDefinition = {
  id: 'internalShape',
  name: 'Internal Shape',
  context: '2d',
  icon: InternalShapeIcon,
  cursor: 'crosshair',
  group: 'draw',
};