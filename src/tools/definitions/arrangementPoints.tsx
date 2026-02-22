import React from 'react';
import { ToolDefinition } from '../types';

const ArrangementPointsIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
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
    {/* Avatar silhouette */}
    <circle cx="9" cy="3.5" r="2" />
    <path d="M9 5.5V10" />
    <path d="M5 7L9 6L13 7" />
    <path d="M7 15L9 10L11 15" />
    {/* Arrangement point markers */}
    <rect x="2" y="6" width="2" height="3" fill="currentColor" fillOpacity="0.3" />
    <rect x="14" y="6" width="2" height="3" fill="currentColor" fillOpacity="0.3" />
    <rect x="7" y="12" width="4" height="2" fill="currentColor" fillOpacity="0.3" />
  </svg>
);

export const arrangementPointsTool: ToolDefinition = {
  id: 'arrangementPoints',
  name: 'Arrangement Points',
  context: '3d',
  shortcut: 'a',
  icon: ArrangementPointsIcon,
  cursor: 'crosshair',
  group: '3d-arrange',
  options: [
    {
      id: 'snapToBody',
      label: 'Snap to Body',
      type: 'toggle',
      value: true,
    },
    {
      id: 'distance',
      label: 'Distance (mm)',
      type: 'number',
      value: 10,
      min: 0,
      max: 50,
      step: 1,
    },
  ],
};
