import React from 'react';
import { ToolDefinition } from '../types';

const EditConstrainIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
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
    <path d="M4 4L14 4L14 14L4 14Z"/>
    {/* Constraint arrows at edges */}
    <path d="M9 2L9 4"/>
    <path d="M7 3L9 1L11 3"/>
    <path d="M16 9L14 9"/>
    <path d="M15 7L17 9L15 11"/>
    <path d="M9 16L9 14"/>
    <path d="M11 15L9 17L7 15"/>
    <path d="M2 9L4 9"/>
    <path d="M3 11L1 9L3 7"/>
  </svg>
);

export const editConstrainTool: ToolDefinition = {
  id: 'editConstrain',
  name: 'Edit Pattern (Constrained)',
  context: '2d',
  icon: EditConstrainIcon,
  cursor: 'default',
  group: 'select',
  copilot: {
    description: 'Edit pattern pieces while maintaining dimensional constraints and relationships. Preserves seam lengths, angles, and connected piece relationships during modifications. When you move one point, connected geometry adjusts automatically to maintain pattern integrity and fit.',
    examples: [
      'Adjust the waist while keeping seam lengths',
      'Move the shoulder point with constraints',
      'Edit the dart maintaining the angle',
      'Resize while preserving proportions',
    ],
    keywords: ['constrain', 'constraint', 'parametric', 'locked', 'maintain', 'preserve', 'linked', 'proportional edit'],
    requiresSelection: 'piece',
    produces: 'piece',
    undoable: true,
  },
};