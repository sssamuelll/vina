import React from 'react';
import { ToolDefinition } from '../types';

const GradingIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
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
    {/* Ruler line */}
    <path d="M2 16L16 2"/>
    {/* Measurement marks */}
    <path d="M4 14L6 12"/>
    <path d="M6 12L8 10"/>
    <path d="M8 10L10 8"/>
    <path d="M10 8L12 6"/>
    <path d="M12 6L14 4"/>
    {/* Short marks */}
    <path d="M3 15L4 14"/>
    <path d="M5 13L6 12"/>
    <path d="M7 11L8 10"/>
    <path d="M9 9L10 8"/>
    <path d="M11 7L12 6"/>
    <path d="M13 5L14 4"/>
  </svg>
);

export const gradingTool: ToolDefinition = {
  id: 'grading',
  name: 'Grading',
  context: '2d',
  icon: GradingIcon,
  cursor: 'default',
  group: 'annotation',
  copilot: {
    description: 'Opens the grading tool for creating multiple sizes from a base pattern. Defines grade rules that scale pattern pieces up or down to create a size range (e.g., XS to XL). Each grading point can have different X/Y offsets per size.',
    examples: [
      'Grade this pattern to size L',
      'Create size range from S to XL',
      'Add grading rules',
      'Scale the pattern to different sizes',
    ],
    keywords: ['grading', 'size', 'scale', 'sizing', 'range', 'grade', 'rules', 'XS', 'S', 'M', 'L', 'XL'],
    requiresSelection: 'piece',
    produces: 'piece',
    undoable: true,
  },
};