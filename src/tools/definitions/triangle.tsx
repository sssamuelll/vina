/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import { ToolDefinition } from '../types';

const TriangleIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
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
    <path d="M9 3 L15 15 L3 15 Z" />
  </svg>
);

export const triangleTool: ToolDefinition = {
  id: 'triangle',
  name: 'Triángulo',
  context: '2d',
  // Sin atajo a propósito: las cinco herramientas de la tanda 6 entraron sin
  // uno («repartir mnemónicos inventados enseñaría un hábito que CLO rompe»)
  // y el triángulo entra igual (issue #1111, tanda 8).
  icon: TriangleIcon,
  cursor: 'crosshair',
  group: 'draw',
  options: [
    {
      id: 'shapeType',
      label: 'Figura',
      type: 'select',
      value: 'isosceles',
      choices: [
        { label: 'Isósceles', value: 'isosceles' },
        { label: 'Rectángulo', value: 'right' },
      ],
    },
    {
      id: 'base',
      label: 'Base',
      type: 'number',
      control: 'input',
      value: 100,
      min: 1,
      max: 3000,
      step: 1,
    },
    {
      id: 'altura',
      label: 'Altura',
      type: 'number',
      control: 'input',
      value: 100,
      min: 1,
      max: 3000,
      step: 1,
    },
  ],
  copilot: {
    description:
      'Draw triangular pattern pieces. Creates closed three-sided shapes — isosceles (apex centered over the base) or right triangle (right angle at the drag corner). Useful for gussets, godets, and other triangular pattern elements.',
    examples: [
      'Draw a triangle with 100mm base and 100mm height',
      'Create a right triangle gusset',
      'Add an isosceles triangle piece',
    ],
    keywords: [
      'triangle',
      'triangular',
      'gusset',
      'godet',
      'isosceles',
      'right triangle',
      'wedge',
    ],
    requiresSelection: 'none',
    produces: 'piece',
    undoable: true,
    dangerous: false,
    parameterHints: {
      shapeType: 'Type of triangle: isosceles (apex centered) or right (right angle at the drag corner)',
      base: 'Base width of the triangle in millimeters',
      altura: 'Height of the triangle in millimeters',
    },
  },
};
