/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import { ToolDefinition } from '../types';

const CircleIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
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
    <circle cx="9" cy="9" r="6"/>
  </svg>
);

export const circleTool: ToolDefinition = {
  id: 'circle',
  name: 'Elipse (círculo)',
  context: '2d',
  shortcut: 'e',
  icon: CircleIcon,
  cursor: 'crosshair',
  group: 'draw',
  options: [
    {
      id: 'shapeType',
      label: 'Figura',
      type: 'select',
      value: 'circle',
      // Sin Arco: un arco es un camino ABIERTO y `addPiece` asume pieza cerrada
      // (el 3D extruye con THREE.Shape). Como PIEZA no significa nada; como
      // línea interna ya existe `internalShape` (#1111).
      choices: [
        { label: 'Círculo', value: 'circle' },
        { label: 'Elipse', value: 'ellipse' },
      ],
    },
    {
      id: 'radius',
      label: 'Radio',
      type: 'number',
      value: 50,
      min: 5,
      max: 500,
      step: 5,
    },
  ],
  copilot: {
    description:
      'Draw circular or elliptical pattern pieces. Creates closed round shapes — full circles and ellipses. Useful for circular skirts, curved design elements, and rounded pattern components.',
    examples: [
      'Draw a circle with 50mm radius',
      'Create an ellipse for the neckline',
      'Add a circular skirt piece',
    ],
    keywords: [
      'circle',
      'ellipse',
      'oval',
      'round',
      'curve',
      'radius',
      'diameter',
      'circular',
    ],
    requiresSelection: 'none',
    produces: 'piece',
    undoable: true,
    dangerous: false,
    parameterHints: {
      shapeType: 'Type of shape: circle or ellipse',
      radius: 'Radius of the circle or base radius for ellipse in millimeters',
    },
  },
};