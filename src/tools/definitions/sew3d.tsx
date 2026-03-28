import React from 'react';
import { ToolDefinition } from '../types';

// eslint-disable-next-line react-refresh/only-export-components
const Sew3DIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
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
    <path d="M4 2L14 9L4 16" />
    <path d="M14 2L4 9L14 16" />
  </svg>
);

export const sew3dTool: ToolDefinition = {
  id: 'sew3d',
  name: 'Sew Edges',
  description: 'Click two edges in 3D to create a seam',
  context: '3d',
  icon: Sew3DIcon,
  cursor: 'crosshair',
  group: '3d-edit',
  copilot: {
    description: 'Creates a seam between two pattern piece edges by clicking them in the 3D viewport. Click the first edge, then the second edge. The seam will be created with standard stitch type.',
    examples: ['Sew the side seams', 'Connect the shoulder edges', 'Create armhole seam'],
    keywords: ['sew', 'seam', 'stitch', 'join', 'connect', 'edge'],
    requiresSelection: 'none',
    produces: 'seam',
    undoable: true,
  },
};
