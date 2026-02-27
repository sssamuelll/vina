/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import React from 'react';
import { ToolDefinition } from '../types';

const PoseIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
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
    <circle cx="9" cy="3.5" r="2" />
    <path d="M9 5.5V11" />
    <path d="M5 7.5L9 6.5L13 7.5" />
    <path d="M6.5 16L9 11L11.5 16" />
  </svg>
);

export const poseTool: ToolDefinition = {
  id: 'pose',
  name: 'Pose',
  context: '3d',
  icon: PoseIcon,
  cursor: 'pointer',
  group: '3d-avatar',
  options: [
    {
      id: 'sensitivity',
      label: 'Sensitivity',
      type: 'number',
      value: 0.5,
      min: 0.1,
      max: 2.0,
      step: 0.1,
    },
    {
      id: 'constraints',
      label: 'Constraint Toggle',
      type: 'toggle',
      value: true,
    },
  ],
  copilot: {
    description: 'Adjust the 3D avatar pose by manipulating body joints. Click and drag on avatar limbs to rotate joints. Constraints prevent unnatural poses when enabled. Use to position the avatar for try-on visualization, fitting checks, or movement simulation. Affects how garments drape on the body.',
    examples: [
      'Raise the avatar arms',
      'Pose the model with hands on hips',
      'Bend the elbows',
      'Put the avatar in a walking pose',
    ],
    keywords: ['pose', 'position', 'avatar', 'mannequin', 'body', 'joints', 'limbs', 'stance', 'posture'],
    requiresSelection: 'none',
    produces: 'simulation',
    undoable: true,
    parameterHints: {
      sensitivity: 'How responsive joint rotation is to mouse movement (0.1 = precise, 2.0 = fast)',
      constraints: 'When enabled, prevents joints from bending beyond natural human limits',
    },
  },
};