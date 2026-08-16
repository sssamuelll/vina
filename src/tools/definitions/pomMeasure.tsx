/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import { ToolDefinition } from '../types';

const POMIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <line x1="3" y1="14" x2="15" y2="4" />
    <line x1="3" y1="14" x2="5" y2="12" strokeWidth={2} />
    <line x1="13" y1="6" x2="15" y2="4" strokeWidth={2} />
    <line x1="7" y1="10" x2="8" y2="9" />
    <line x1="9" y1="8" x2="10" y2="7" />
    <text x="9" y="16" fontSize="5" fill="currentColor" textAnchor="middle" stroke="none">POM</text>
  </svg>
);

export const pomMeasureTool: ToolDefinition = {
  id: 'pomMeasure',
  name: 'Medir POM',
  description: 'Create persistent named measurements (Points of Measure)',
  context: '2d',
  shortcut: 'p',
  icon: POMIcon,
  cursor: 'crosshair',
  group: 'annotation',
  options: [
    { id: 'method', label: 'Method', type: 'select', value: 'straight', choices: [{ label: 'Straight', value: 'straight' }, { label: 'Along Edge', value: 'alongEdge' }] },
    { id: 'defaultCategory', label: 'Category', type: 'select', value: 'custom', choices: [{ label: 'Length', value: 'length' }, { label: 'Width', value: 'width' }, { label: 'Custom', value: 'custom' }] },
  ],
  copilot: {
    description: 'Create a persistent named measurement (Point of Measure) on the 2D pattern. Straight mode measures point-to-point, along-edge mode measures full edge arc-length.',
    examples: ['Add a chest width measurement', 'Measure the side seam length', 'Create a POM for the hemline'],
    keywords: ['pom', 'measurement', 'point of measure', 'dimension', 'tech pack', 'persistent'],
    requiresSelection: 'none',
    produces: 'measurement',
    undoable: true,
    parameterHints: { method: 'straight or alongEdge', defaultCategory: 'length, width, or custom' },
  },
};
