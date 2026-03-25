/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import { ToolDefinition } from '../types';

const BoxSelectIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <rect x="3" y="3" width="18" height="18" rx="1" strokeDasharray="4 2" />
    <circle cx="12" cy="12" r="2" fill="currentColor" />
  </svg>
);

const LassoSelectIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="M5 8C5 5 8 3 12 3s7 2 7 5-3 5-7 5S5 11 5 8z" strokeDasharray="4 2" />
    <circle cx="12" cy="16" r="2" fill="currentColor" />
  </svg>
);

export const meshSelectBoxTool: ToolDefinition = {
  id: 'meshSelectBox',
  name: 'Box Select (3D)',
  context: '3d',
  shortcut: 'v',
  icon: BoxSelectIcon,
  cursor: 'crosshair',
  group: '3d-arrange',
  subTools: ['meshSelectBox', 'meshSelectLasso'],
  options: [
    {
      id: 'mode',
      label: 'Mode',
      type: 'select',
      value: 'replace',
      choices: [
        { label: 'Replace', value: 'replace' },
        { label: 'Add', value: 'add' },
        { label: 'Subtract', value: 'subtract' },
      ],
    },
  ],
  copilot: {
    description: 'Select 3D mesh vertices by dragging a rectangular box in the 3D viewport.',
    examples: ['Select vertices with box select', 'Use box selection in 3D'],
    keywords: ['box select', 'rectangle select', 'vertex select', 'mesh select', '3D select'],
    requiresSelection: undefined,
    produces: 'none',
    undoable: false,
  },
};

export const meshSelectLassoTool: ToolDefinition = {
  id: 'meshSelectLasso',
  name: 'Lasso Select (3D)',
  context: '3d',
  icon: LassoSelectIcon,
  cursor: 'crosshair',
  group: '3d-arrange',
  hidden: true,
  options: [
    {
      id: 'mode',
      label: 'Mode',
      type: 'select',
      value: 'replace',
      choices: [
        { label: 'Replace', value: 'replace' },
        { label: 'Add', value: 'add' },
        { label: 'Subtract', value: 'subtract' },
      ],
    },
  ],
  copilot: {
    description: 'Select 3D mesh vertices by drawing a freeform lasso polygon in the 3D viewport.',
    examples: ['Lasso select vertices', 'Freeform 3D selection'],
    keywords: ['lasso select', 'freeform select', 'polygon select', 'mesh select'],
    requiresSelection: undefined,
    produces: 'none',
    undoable: false,
  },
};
