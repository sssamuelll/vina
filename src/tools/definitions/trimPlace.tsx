/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import { ToolDefinition } from '../types';

const TrimPlaceIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
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
    <circle cx="9" cy="9" r="4" />
    <circle cx="9" cy="9" r="1.5" fill="currentColor" />
    <line x1="9" y1="1" x2="9" y2="4" />
    <line x1="9" y1="14" x2="9" y2="17" />
    <line x1="1" y1="9" x2="4" y2="9" />
    <line x1="14" y1="9" x2="17" y2="9" />
  </svg>
);

export const trimPlaceTool: ToolDefinition = {
  id: 'trimPlace',
  name: 'Place Trim',
  description: 'Click on pattern pieces to place trims (buttons, zippers, snaps)',
  context: '2d',
  icon: TrimPlaceIcon,
  cursor: 'crosshair',
  group: 'sewing',
  copilot: {
    description: 'Place trims (buttons, zippers, snaps, rivets, buckles) on pattern pieces by clicking. Select a preset from the trim library, then click on pieces to place. / Colocar avios (botones, cremalleras, broches, remaches, hebillas) haciendo clic en las piezas del patron.',
    examples: [
      'Place buttons on the front bodice',
      'Add a zipper to the center front',
      'Put snaps on the cuff',
    ],
    keywords: ['trim', 'button', 'zipper', 'snap', 'rivet', 'buckle', 'place', 'attach'],
    requiresSelection: 'none',
    produces: 'modification',
    undoable: true,
  },
};
