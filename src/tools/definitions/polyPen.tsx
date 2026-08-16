/* eslint-disable react-refresh/only-export-components */
import type { ToolDefinition } from '../types';

const PolyPenIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 17L7 3L13 10L17 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx="3" cy="17" r="1.5" fill="currentColor"/>
    <circle cx="7" cy="3" r="1.5" fill="currentColor"/>
    <circle cx="13" cy="10" r="1.5" fill="currentColor"/>
    <circle cx="17" cy="5" r="1.5" fill="currentColor"/>
  </svg>
);

export const polyPenTool: ToolDefinition = {
  id: 'polyPen',
  name: 'Pluma poligonal',
  description: 'Draw pattern shapes with combined straight lines and bezier curves',
  context: '2d',
  shortcut: 'y',
  icon: PolyPenIcon,
  cursor: 'crosshair',
  group: 'draw',
  options: [
    {
      id: 'mode',
      label: 'Mode',
      type: 'select',
      value: 'piece',
      choices: [
        { label: 'New Piece', value: 'piece' },
        { label: 'Internal Line', value: 'internalLine' },
      ],
    },
    {
      id: 'lineType',
      label: 'Line Type',
      type: 'select',
      value: 'fold',
      choices: [
        { label: 'Fold', value: 'fold' },
        { label: 'Reference', value: 'reference' },
        { label: 'Topstitch', value: 'topstitch' },
      ],
    },
    {
      id: 'snapGrid',
      label: 'Snap to Grid',
      type: 'toggle',
      value: true,
    },
  ],
  copilot: {
    description: 'Draw pattern shapes with combined straight lines and bezier curves. Click for straight segments, click+drag for bezier curves.',
    examples: ['Draw a rectangle piece at (0,0) 200mm × 400mm', 'Draw a curved neckline as an internal fold line'],
    keywords: ['draw', 'polygon', 'pen', 'shape', 'curve', 'straight'],
    requiresSelection: 'none',
    produces: 'piece',
    undoable: true,
    parameterHints: { points: 'Array of {x, y, type, handleIn?, handleOut?}', mode: 'piece or internalLine' },
  },
};
