/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import { ToolDefinition } from '../types';

const TopstitchSeamlineIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 18 18" fill="none"
    stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 5L15 5" strokeDasharray="2 1.5" />
    <path d="M3 9L15 9" opacity={0.3} />
    <path d="M3 13L15 13" strokeDasharray="2 1.5" />
  </svg>
);

export const topstitchSeamlineTool: ToolDefinition = {
  id: 'topstitchSeamline',
  name: 'Pespunte sobre costura',
  description: 'Add topstitch along a seam edge',
  context: '2d',
  shortcut: ';',
  icon: TopstitchSeamlineIcon,
  cursor: 'crosshair',
  group: 'sewing',
  options: [
    { id: 'stitchType', label: 'Stitch Type', type: 'select', value: 'straight',
      choices: [{ label: 'Straight', value: 'straight' }, { label: 'Zigzag', value: 'zigzag' }, { label: 'Triple', value: 'triple' }] },
    { id: 'stitchLength', label: 'Stitch Length (mm)', type: 'number', value: 3.0, min: 1.0, max: 8.0, step: 0.5 },
    { id: 'offset', label: 'Offset (mm)', type: 'number', value: 5.0, min: 1.0, max: 20.0, step: 0.5 },
    { id: 'threadColor', label: 'Thread Color', type: 'color', value: '#333333' },
  ],
  copilot: {
    description: 'Add topstitch along an existing seam edge. Click a piece edge to auto-generate a topstitch line at the specified offset.',
    examples: ['Add topstitch along the shoulder seam', 'Topstitch the hem'],
    keywords: ['topstitch', 'stitch', 'seam', 'finishing'],
    requiresSelection: 'none',
    produces: 'internalLine',
    undoable: true,
    parameterHints: { stitchType: 'Stitch pattern', offset: 'Distance from edge in mm' },
  },
};
