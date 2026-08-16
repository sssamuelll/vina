/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import { ToolDefinition } from '../types';

const SeamIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
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
    <path d="M6 3V15M12 3V15"/>
    <path d="M6 6L12 6M6 9L12 9M6 12L12 12" strokeWidth="1"/>
  </svg>
);

export const seamTool: ToolDefinition = {
  id: 'seam',
  name: 'Coser',
  description: 'Connect pattern pieces with sewing seams',
  context: '2d',
  icon: SeamIcon,
  cursor: 'pointer',
  group: 'sewing',
  options: [
    {
      id: 'seamType',
      label: 'Tipo de costura',
      type: 'select',
      value: 'standard',
      choices: [
        { label: 'Normal', value: 'standard' },
        { label: 'Francesa', value: 'french' },
        { label: 'Rebatida', value: 'flat-felled' },
        { label: 'Overlock', value: 'overlock' },
      ],
    },
    {
      id: 'stitchLength',
      label: 'Largo de puntada',
      type: 'number',
      value: 2.5,
      min: 1.0,
      max: 6.0,
      step: 0.1,
    },
  ],
  copilot: {
    description: 'Create seams to connect pattern pieces. Click on an edge of one piece, then click on the corresponding edge of another piece to create a seam. Seams define how pieces are sewn together in 3D simulation.',
    examples: [
      'Sew the shoulder seams',
      'Connect the side seam from armhole to hem',
      'Add a French seam to the front and back',
      'Join the sleeve to the armhole',
    ],
    keywords: ['seam', 'sew', 'stitch', 'join', 'connect', 'attach', 'assemble'],
    requiresSelection: 'none',
    produces: 'seam',
    undoable: true,
    parameterHints: {
      seamType: 'Type of seam construction: standard, French (enclosed), flat-felled (visible topstitch), or overlock (serged)',
      stitchLength: 'Length of each stitch in millimeters (affects simulation behavior)',
    },
  },
};