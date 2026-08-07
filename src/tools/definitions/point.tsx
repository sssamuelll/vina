/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import { ToolDefinition } from '../types';

const PointIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
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
    <path d="M2 9H6M12 9H16" />
    <circle cx="9" cy="9" r="2.2" />
  </svg>
);

export const pointTool: ToolDefinition = {
  id: 'point',
  name: 'Punto',
  context: '2d',
  icon: PointIcon,
  cursor: 'crosshair',
  group: 'editing',
  // Option ids land in toolOptions.point with the keys usePointTool reads
  // (convención G6, igual que notch). El sub-modo es un modo latcheado:
  // persiste entre activaciones vía toolMemory.
  options: [
    {
      id: 'mode',
      label: 'Tipo de punto',
      type: 'select',
      value: 'point',
      choices: [
        { label: 'Punto', value: 'point' },
        { label: 'Curva por puntos', value: 'curvePoints' },
        { label: 'Curva bezier', value: 'bezier' },
      ],
    },
  ],
  copilot: {
    description:
      'Add a point to a piece outline side, or convert a straight side into a curve — either a point-based curve (patternmaker style, points ON the line) or a bezier curve with handles. Click a side to apply the active mode. Existing anchor points and locked pieces are never modified.',
    examples: [
      'Add a point to this line',
      'Convert this side into a curve by points',
      'Make this straight edge a bezier curve',
      'Add a point in the middle of the hem',
    ],
    keywords: [
      'point',
      'add point',
      'curve point',
      'bezier',
      'convert',
      'segment',
      'side',
      'insert',
      'punto',
      'curva',
    ],
    requiresSelection: 'edge',
    produces: 'point',
    undoable: true,
    dangerous: false,
    parameterHints: {
      mode: 'What the click applies: "point" inserts an anchor at the clicked spot; "curvePoints" converts the whole side into a point-based curve; "bezier" converts it into a bezier curve',
    },
  },
};
