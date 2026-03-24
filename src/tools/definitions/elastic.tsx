/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import { ToolDefinition } from '../types';

const ElasticIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
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
    {/* Zigzag/wavy line */}
    <path d="M2 9L4 5L6 13L8 5L10 13L12 5L14 13L16 9"/>
  </svg>
);

export const elasticTool: ToolDefinition = {
  id: 'elastic',
  name: 'Elastic / Gathering',
  context: '2d',
  icon: ElasticIcon,
  cursor: 'default',
  group: 'sewing',
  copilot: {
    description: 'Add elastic or gathering properties to pattern edges. Elastic edges contract to a shorter finished length, creating stretch or gathered effects. Select an edge and specify the gathered/stretched ratio. Used for waistbands, cuffs, necklines, and any area requiring elastic or shirring.',
    examples: [
      'Add elastic to the waistband',
      'Create gathering on this sleeve edge',
      'Make this edge gathered to 80%',
      'Add shirring to the bodice back',
    ],
    keywords: ['elastic', 'gather', 'shirr', 'ruffle', 'stretch', 'contract', 'waistband', 'cuff', 'smocking'],
    requiresSelection: 'edge',
    produces: 'elastic',
    undoable: true,
  },
};