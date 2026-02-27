/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import React from 'react';
import { ToolDefinition } from '../types';

const TransformIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
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
    <circle cx="4" cy="4" r="2"/>
    <circle cx="14" cy="4" r="2"/>
    <circle cx="4" cy="14" r="2"/>
    <circle cx="14" cy="14" r="2"/>
    <path d="M6 4H12M4 6V12M14 6V12M6 14H12"/>
  </svg>
);

export const transformTool: ToolDefinition = {
  id: 'transform',
  name: 'Transform',
  context: '2d',
  shortcut: 't',
  icon: TransformIcon,
  cursor: 'default',
  group: 'select',
  options: [
    {
      id: 'mode',
      label: 'Transform Mode',
      type: 'select',
      value: 'scale',
      choices: [
        { label: 'Scale', value: 'scale' },
        { label: 'Rotate', value: 'rotate' },
        { label: 'Skew', value: 'skew' },
      ],
    },
    {
      id: 'uniform',
      label: 'Uniform Scale',
      type: 'toggle',
      value: true,
    },
  ],
  copilot: {
    description: 'Transform selected pattern pieces by scaling, rotating, or skewing. Scale mode resizes pieces proportionally (uniform) or independently per axis. Rotate mode spins pieces around their center. Skew mode applies angular distortion. Drag corner handles to transform interactively.',
    examples: [
      'Scale the bodice up by 10%',
      'Rotate the sleeve 45 degrees',
      'Make this piece smaller',
      'Skew the pocket shape',
    ],
    keywords: ['transform', 'scale', 'resize', 'rotate', 'spin', 'skew', 'distort', 'enlarge', 'shrink', 'stretch'],
    requiresSelection: 'piece',
    produces: 'piece',
    undoable: true,
    parameterHints: {
      mode: 'Transform operation type: scale (resize), rotate (spin), or skew (angular distortion)',
      uniform: 'When enabled, scaling maintains aspect ratio; when disabled, X and Y scale independently',
    },
  },
};