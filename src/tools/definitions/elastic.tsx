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
};