import React from 'react';
import { ToolDefinition } from '../types';

const CircTapeIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 18 18" fill="none"
    stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx="9" cy="9" rx="6" ry="3" />
    <line x1="9" y1="6" x2="9" y2="12" strokeDasharray="1 1" />
    <line x1="3" y1="9" x2="15" y2="9" />
  </svg>
);

const LinearTapeIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 18 18" fill="none"
    stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <line x1="3" y1="15" x2="15" y2="3" />
    <circle cx="3" cy="15" r="1.5" fill="currentColor" />
    <circle cx="15" cy="3" r="1.5" fill="currentColor" />
    <line x1="5" y1="13" x2="7" y2="11" strokeWidth={0.75} />
    <line x1="9" y1="9" x2="11" y2="7" strokeWidth={0.75} />
  </svg>
);

export const tapeMeasureCircTool: ToolDefinition = {
  id: 'tape-circumference',
  name: 'Circumference Tape',
  description: 'Measure around body contours',
  context: '3d',
  icon: CircTapeIcon,
  cursor: 'crosshair',
  group: '3d-avatar',
  shortcut: 'c',
  subTools: ['tape-linear'],
  copilot: {
    description: 'Measures circumference around the avatar body at a specified height or location. Used for taking body measurements like chest, waist, hip, neck, and arm circumferences. Click on the avatar to place a horizontal measuring tape that wraps around the body contour.',
    examples: [
      'Measure the waist circumference',
      'Take a chest measurement',
      'What is the hip circumference?',
      'Measure around the neck',
    ],
    keywords: ['circumference', 'measure', 'tape', 'girth', 'around', 'chest', 'waist', 'hip', 'bust'],
    requiresSelection: 'none',
    produces: 'measurement',
    undoable: true,
  },
};

export const tapeMeasureLinearTool: ToolDefinition = {
  id: 'tape-linear',
  name: 'Linear Tape',
  description: 'Measure point-to-point distance',
  context: '3d',
  icon: LinearTapeIcon,
  cursor: 'crosshair',
  group: '3d-avatar',
  shortcut: 'l',
  hidden: true, // Only appears in flyout from Circumference Tape
  copilot: {
    description: 'Measures straight-line distance between two points on the avatar body. Used for length measurements like shoulder width, arm length, torso length, and inseam. Click two points on the avatar to create a linear measurement.',
    examples: [
      'Measure shoulder to wrist length',
      'What is the inseam measurement?',
      'Measure the back length',
      'Take a sleeve length measurement',
    ],
    keywords: ['linear', 'length', 'distance', 'straight', 'point-to-point', 'inseam', 'shoulder', 'arm'],
    requiresSelection: 'none',
    produces: 'measurement',
    undoable: true,
  },
};
