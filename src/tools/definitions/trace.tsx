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
};
