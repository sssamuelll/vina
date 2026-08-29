/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import { ToolDefinition } from '../types';

const InternalShapeIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 18 18" 
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeDasharray="2 2"
  >
    {/* Dashed rectangle outline */}
    <rect x="3" y="3" width="12" height="12"/>
  </svg>
);

export const internalShapeTool: ToolDefinition = {
  id: 'internalShape',
  name: 'Línea interna',
  context: '2d',
  shortcut: 'g',
  icon: InternalShapeIcon,
  cursor: 'crosshair',
  group: 'draw',
  options: [
    {
      id: 'nodeType',
      label: 'Tipo de punto',
      type: 'select',
      value: 'straight',
      choices: [
        { label: 'Recta', value: 'straight' },
        { label: 'Curva por puntos', value: 'curvePoints' },
      ],
    },
    {
      id: 'lineType',
      label: 'Tipo de línea',
      type: 'select',
      value: 'reference',
      choices: [
        { label: 'Referencia', value: 'reference' },
        { label: 'Doblez', value: 'fold' },
        { label: 'Pespunte', value: 'topstitch' },
      ],
    },
  ],
  copilot: {
    description: 'Draw internal lines: straight, curve-by-points, or bezier nodes in one continuous stroke, snapping to piece corners, edges, and other internal-line endpoints. Click for a node of the active point type, click-drag for a bezier node with symmetric handles. Finish with Enter, a double-click, or by clicking back on the first node to close the shape. Used to mark pocket placement, fold lines, topstitch guides, and other fabrication references.',
    examples: [
      'Mark the pocket placement on the bodice',
      'Draw an internal reference line',
      'Add a placement guide for construction',
      'Mark internal fabrication details',
    ],
    keywords: ['internal', 'marking', 'reference', 'guide', 'placement', 'pocket', 'line', 'fabrication', 'snap', 'curve', 'bezier'],
    requiresSelection: 'piece',
    produces: 'none',
    undoable: true,
    parameterHints: {
      nodeType: 'Point type each click places: "straight" for a corner, "curvePoints" for a point-based curve node (Catmull-Rom through the block). A click-drag always places a bezier node regardless of this setting.',
      lineType: 'What kind of internal line this becomes on commit: "reference" (default), "fold", or "topstitch"',
    },
  },
};