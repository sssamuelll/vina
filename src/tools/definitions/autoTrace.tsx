/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import { ToolDefinition } from '../types';

const AutoTraceIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
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
    <rect x="2" y="2" width="14" height="14" rx="1" strokeDasharray="3 2" />
    <path d="M5 13L8 7L11 10L14 5" />
  </svg>
);

export const autoTraceTool: ToolDefinition = {
  id: 'autoTrace',
  name: 'Auto-Trace',
  description: 'Detect edges in reference image and convert to pattern pieces',
  context: '2d',
  icon: AutoTraceIcon,
  cursor: 'crosshair',
  group: 'draw',
  options: [
    { id: 'threshold', label: 'Edge Threshold', type: 'number', value: 50, min: 10, max: 200, step: 5 },
    { id: 'smoothing', label: 'Smoothing (px)', type: 'number', value: 2, min: 0, max: 10, step: 1 },
    { id: 'minArea', label: 'Min Area (mm\u00B2)', type: 'number', value: 100, min: 0, max: 10000, step: 50 },
  ],
  copilot: {
    description: 'Automatically detects edges in a reference image and converts detected contours to pattern piece outlines. Uses Canny edge detection with adjustable threshold and smoothing. Contours sorted by area (largest first). / Detecta autom\u00E1ticamente bordes en una imagen de referencia y convierte los contornos en piezas de patr\u00F3n.',
    examples: ['Trace the pattern from the reference image', 'Auto-detect the pattern outlines', 'Convert the scanned pattern to pieces'],
    keywords: ['trace', 'auto-trace', 'detect', 'scan', 'vectorize', 'edge', 'contour', 'reference'],
    requiresSelection: 'none',
    produces: 'piece',
    undoable: true,
  },
};
