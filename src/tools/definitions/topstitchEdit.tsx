/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import { ToolDefinition } from '../types';

const TopstitchEditIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 18 18" fill="none"
    stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9L15 9" strokeDasharray="2 1.5" />
    <circle cx="6" cy="9" r="2" fill="none" />
    <circle cx="12" cy="9" r="2" fill="none" />
  </svg>
);

export const topstitchEditTool: ToolDefinition = {
  id: 'topstitchEdit',
  name: 'Editar pespunte',
  description: 'Select and modify existing topstitch lines',
  context: '2d',
  shortcut: 't',
  icon: TopstitchEditIcon,
  cursor: 'default',
  group: 'sewing',
  options: [],
  copilot: {
    description: 'Select and edit existing topstitch lines. Click to select, drag endpoints to adjust, Backspace to delete.',
    examples: ['Select the shoulder topstitch', 'Move the hem topstitch'],
    keywords: ['topstitch', 'edit', 'select', 'modify', 'move'],
    requiresSelection: 'internalLine',
    produces: 'modification',
    undoable: true,
    parameterHints: {},
  },
};
