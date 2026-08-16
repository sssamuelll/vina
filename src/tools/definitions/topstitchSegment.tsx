/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import { ToolDefinition } from '../types';

const TopstitchSegmentIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 18 18" fill="none"
    stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9L15 9" opacity={0.3} />
    <path d="M6 5L12 5" strokeDasharray="2 1.5" strokeWidth={2} />
    <circle cx="6" cy="5" r="1.5" fill="currentColor" />
    <circle cx="12" cy="5" r="1.5" fill="currentColor" />
  </svg>
);

export const topstitchSegmentTool: ToolDefinition = {
  id: 'topstitchSegment',
  name: 'Pespunte por tramo',
  description: 'Add topstitch to a specific edge segment',
  context: '2d',
  shortcut: 'k',
  icon: TopstitchSegmentIcon,
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
    description: 'Add topstitch to a partial edge segment. Click two points on an edge to define the segment.',
    examples: ['Topstitch only the top half of the side seam'],
    keywords: ['topstitch', 'segment', 'partial', 'stitch'],
    requiresSelection: 'none',
    produces: 'internalLine',
    undoable: true,
    parameterHints: { stitchType: 'Stitch pattern', offset: 'Distance from edge in mm' },
  },
};
