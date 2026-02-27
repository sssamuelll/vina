/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import React from 'react';
import { ToolDefinition } from '../types';

const AddPieceIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
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
    {/* Pattern piece outline */}
    <path d="M3 3L15 3L15 15L3 15Z"/>
    {/* Plus symbol */}
    <path d="M9 6L9 12"/>
    <path d="M6 9L12 9"/>
  </svg>
);

export const addPieceTool: ToolDefinition = {
  id: 'addPiece',
  name: 'Add Piece',
  context: '2d',
  icon: AddPieceIcon,
  cursor: 'default',
  group: 'pattern',
  copilot: {
    description: 'Creates a new pattern piece from scratch. Opens a dialog or workflow to define a new garment component such as a bodice, sleeve, collar, or pocket. This is the starting point for building patterns.',
    examples: [
      'Add a new pattern piece',
      'Create a sleeve piece',
      'I need to make a new collar',
      'Start a new bodice pattern',
    ],
    keywords: ['create', 'new', 'piece', 'add', 'pattern', 'block', 'component', 'start'],
    requiresSelection: 'none',
    produces: 'piece',
    undoable: true,
  },
};