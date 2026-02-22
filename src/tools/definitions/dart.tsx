import React from 'react';
import { ToolDefinition } from '../types';

const DartIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
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
    {/* Dart shape: V pointing inward from edge */}
    <path d="M4 3L9 10L14 3" />
    <path d="M4 3H14" strokeDasharray="2 2" />
    <circle cx="9" cy="10" r="1" fill="currentColor" />
  </svg>
);

export const dartTool: ToolDefinition = {
  id: 'dart',
  name: 'Dart',
  context: '2d',
  shortcut: 'd',
  icon: DartIcon,
  cursor: 'crosshair',
  group: 'draw',
  options: [
    {
      id: 'dartWidth',
      label: 'Width (mm)',
      type: 'number',
      value: 20,
      min: 5,
      max: 80,
      step: 1,
    },
    {
      id: 'dartDepth',
      label: 'Depth (mm)',
      type: 'number',
      value: 100,
      min: 20,
      max: 300,
      step: 5,
    },
  ],
};
