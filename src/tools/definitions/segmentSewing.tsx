/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import { ToolDefinition } from '../types';

const SegmentSewingIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
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
    {/* Two partial edges with connection */}
    <path d="M3 4V14" opacity={0.3} />
    <path d="M3 7V11" strokeWidth={2.5} />
    <path d="M15 4V14" opacity={0.3} />
    <path d="M15 7V11" strokeWidth={2.5} />
    <path d="M3 9L15 9" strokeWidth="1" strokeDasharray="2 1.5" />
  </svg>
);

export const segmentSewingTool: ToolDefinition = {
  id: 'segmentSewing',
  name: 'Segment Sewing',
  description: 'Sew partial edge segments between pieces',
  context: '2d',
  shortcut: 'n',
  icon: SegmentSewingIcon,
  cursor: 'crosshair',
  group: 'sewing',
  options: [
    {
      id: 'seamType',
      label: 'Seam Type',
      type: 'select',
      value: 'standard',
      choices: [
        { label: 'Standard', value: 'standard' },
        { label: 'French', value: 'french' },
        { label: 'Flat-Felled', value: 'flat-felled' },
        { label: 'Overlock', value: 'overlock' },
      ],
    },
  ],
  copilot: {
    description: 'Sew partial edge segments between pattern pieces. Unlike full-edge seam, this lets you select a sub-portion of each edge to sew. Useful for set-in sleeves, yokes, and panel inserts.',
    examples: [
      'Sew the top half of the side seam',
      'Connect part of the sleeve to the armhole',
      'Join a partial seam for the yoke',
    ],
    keywords: ['segment', 'partial', 'sew', 'sub-edge', 'range'],
    requiresSelection: 'none',
    produces: 'seam',
    undoable: true,
    parameterHints: {
      seamType: 'Type of seam construction',
    },
  },
};
