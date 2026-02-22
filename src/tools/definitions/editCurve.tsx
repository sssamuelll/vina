import React from 'react';
import { ToolDefinition } from '../types';

const EditCurveIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
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
    {/* Triangle outline */}
    <path d="M9 2L16 14L2 14Z"/>
    {/* Node dots at corners */}
    <circle cx="9" cy="2" r="1.5" fill="currentColor"/>
    <circle cx="16" cy="14" r="1.5" fill="currentColor"/>
    <circle cx="2" cy="14" r="1.5" fill="currentColor"/>
  </svg>
);

export const editCurveTool: ToolDefinition = {
  id: 'editCurve',
  name: 'Edit Curve Points',
  context: '2d',
  shortcut: 'a',
  icon: EditCurveIcon,
  cursor: 'crosshair',
  group: 'select',
};