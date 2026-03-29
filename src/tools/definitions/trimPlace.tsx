/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import { ToolDefinition } from '../types';
import { TRIM_LIBRARY } from '../../utils/trim/trimLibrary';

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

// Build preset choices grouped by type
const presetChoices = TRIM_LIBRARY.map(p => ({
  label: `${p.name} (${p.size}mm)`,
  value: p.id,
}));

export const trimPlaceTool: ToolDefinition = {
  id: 'trimPlace',
  name: 'Place Trim',
  description: 'Click on pattern edges to place trims (buttons, zippers, snaps)',
  context: '2d',
  icon: TrimPlaceIcon,
  cursor: 'crosshair',
  group: 'sewing',
  options: [
    {
      id: 'trimPreset',
      label: 'Preset',
      type: 'select',
      value: TRIM_LIBRARY[0].id,
      choices: presetChoices,
    },
    {
      id: 'placementMode',
      label: 'Mode',
      type: 'select',
      value: 'single',
      choices: [
        { label: 'Single', value: 'single' },
        { label: 'Distribute', value: 'distribute' },
      ],
    },
    {
      id: 'distributeCount',
      label: 'Count',
      type: 'number',
      value: 5,
      min: 2,
      max: 20,
      step: 1,
    },
    {
      id: 'startOffset',
      label: 'Start Offset (mm)',
      type: 'number',
      value: 10,
      min: 0,
      max: 50,
      step: 1,
    },
    {
      id: 'endOffset',
      label: 'End Offset (mm)',
      type: 'number',
      value: 10,
      min: 0,
      max: 50,
      step: 1,
    },
  ],
  copilot: {
    description:
      'Place trims (buttons, zippers, snaps, rivets, buckles) on pattern piece edges by clicking. ' +
      'Select a preset from the trim library, then click on piece edges to place. ' +
      'Use Distribute mode to evenly space N trims along an edge. ' +
      '/ Colocar avios (botones, cremalleras, broches, remaches, hebillas) en los bordes de piezas del patron.',
    examples: [
      'Place buttons on the front bodice center-front edge',
      'Distribute 5 snaps along the waistband',
      'Add a zipper to the center back',
    ],
    keywords: ['trim', 'button', 'zipper', 'snap', 'rivet', 'buckle', 'place', 'attach', 'distribute'],
    requiresSelection: 'none',
    produces: 'modification',
    undoable: true,
  },
};
