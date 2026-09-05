/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import { ToolDefinition } from '../types';

const SlashAndSpreadIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
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
    {/* Left half of piece */}
    <path d="M2 14L5 4L8 14Z" />
    {/* Right half of piece */}
    <path d="M10 14L13 4L16 14Z" />
    {/* Arrow indicating spread */}
    <path d="M8 9L10 9" />
    <path d="M7 9L8 8M7 9L8 10" />
    <path d="M11 9L10 8M11 9L10 10" />
  </svg>
);

export const slashAndSpreadTool: ToolDefinition = {
  id: 'slashAndSpread',
  // «Abrir la pieza» conserva el verbo que la pista ya enseñaba, y cubre
  // también la equivalencia de pinza, que «Dar vuelo» dejaría fuera.
  name: 'Abrir la pieza',
  context: '2d',
  icon: SlashAndSpreadIcon,
  cursor: 'crosshair',
  group: 'pattern',
  options: [
    {
      id: 'mode',
      // El paréntesis dice en qué se mide cada modo: girando se arrastra un
      // ángulo, en paralelo se arrastra una distancia.
      label: 'Cómo se abre',
      type: 'select',
      value: 'pivot',
      choices: [
        { label: 'Girando (ángulo)', value: 'pivot' },
        { label: 'En paralelo (distancia)', value: 'parallel' },
      ],
    },
    {
      id: 'gapFill',
      label: 'El hueco se cierra',
      type: 'select',
      value: 'straight',
      choices: [
        { label: 'Con una recta', value: 'straight' },
        { label: 'Con una curva', value: 'smooth' },
      ],
    },
  ],
  copilot: {
    description:
      'Slash and spread a pattern piece to add fullness. Cuts a piece along a line and spreads the halves apart by rotating (pivot mode) or translating (parallel mode). Used for flared skirts, dart equivalency, and adding ease.',
    examples: [
      'Spread this skirt panel 15 degrees for flare',
      'Slash and spread the bodice to add fullness',
      'Add 20mm ease by slashing this piece',
    ],
    keywords: ['slash', 'spread', 'fullness', 'flare', 'ease', 'pivot', 'rotate', 'wedge'],
    requiresSelection: 'piece',
    produces: 'piece',
    undoable: true,
    dangerous: false,
  },
};
