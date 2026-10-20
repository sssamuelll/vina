/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import { ToolDefinition } from '../types';

const TopstitchFreeIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 18 18" fill="none"
    stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 14L7 6L11 10L15 4" strokeDasharray="2 1.5" />
  </svg>
);

export const topstitchFreeTool: ToolDefinition = {
  id: 'topstitchFree',
  name: 'Pespunte libre',
  description: 'Draw freeform topstitch lines on a piece',
  context: '2d',
  shortcut: 'l',
  icon: TopstitchFreeIcon,
  cursor: 'crosshair',
  group: 'sewing',
  options: [
    { id: 'stitchType', label: 'Tipo de puntada', type: 'select', value: 'straight',
      choices: [{ label: 'Recta', value: 'straight' }, { label: 'Zigzag', value: 'zigzag' }, { label: 'Triple', value: 'triple' }] },
    { id: 'stitchLength', label: 'Largo de puntada (mm)', type: 'number', value: 3.0, min: 1.0, max: 8.0, step: 0.5 },
    { id: 'threadColor', label: 'Color del hilo', type: 'color', value: '#333333' },
  ],
  copilot: {
    description: 'Draw freeform topstitch lines. Click points on a piece to create a polyline topstitch path.',
    examples: ['Draw a decorative topstitch line across the chest'],
    keywords: ['topstitch', 'free', 'freeform', 'draw', 'decorative'],
    requiresSelection: 'none',
    produces: 'internalLine',
    undoable: true,
    parameterHints: { stitchType: 'Stitch pattern' },
  },
};
