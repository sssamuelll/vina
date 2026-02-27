import React from 'react';
import { ToolDefinition } from '../types';

const TraceIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
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
    {/* Edge being traced */}
    <path d="M3 14C6 14 8 6 12 4L16 3" strokeOpacity="0.3" />
    {/* Trace following the edge */}
    <path d="M3 14C6 14 8 6 12 4L16 3" strokeDasharray="3 2" />
    {/* Pen cursor */}
    <circle cx="12" cy="4" r="1.5" fill="currentColor" />
  </svg>
);

export const traceTool: ToolDefinition = {
  id: 'trace',
  name: 'Trace',
  context: '2d',
  icon: TraceIcon,
  cursor: 'crosshair',
  group: 'draw',
  options: [
    {
      id: 'offset',
      label: 'Offset (mm)',
      type: 'number',
      value: 0,
      min: -50,
      max: 50,
      step: 1,
    },
  ],
  copilot: {
    description: 'Trace along existing pattern edges to create new outlines or offset copies. Click to start tracing from a point, then follow the edge path. Specify an offset distance to create parallel lines inside or outside the original edge. Useful for creating facings, linings, or modified piece variations.',
    examples: [
      'Trace the neckline with 2cm offset',
      'Create a facing by tracing this edge',
      'Trace the outline of this piece',
      'Make an offset copy of the armhole',
    ],
    keywords: ['trace', 'outline', 'offset', 'parallel', 'facing', 'lining', 'copy edge', 'follow'],
    requiresSelection: 'none',
    produces: 'piece',
    undoable: true,
    parameterHints: {
      offset: 'Distance in mm to offset from original edge. Positive = outward, negative = inward',
    },
  },
};
