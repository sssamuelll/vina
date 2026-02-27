import React from 'react';
import { ToolDefinition } from '../types';

const TextAnnotationIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
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
    {/* Letter A */}
    <path d="M9 3L12 15"/>
    <path d="M9 3L6 15"/>
    <path d="M7.5 10L10.5 10"/>
  </svg>
);

export const textAnnotationTool: ToolDefinition = {
  id: 'textAnnotation',
  name: 'Text Annotation',
  context: '2d',
  icon: TextAnnotationIcon,
  cursor: 'text',
  group: 'annotation',
  copilot: {
    description: 'Adds text labels and annotations to pattern pieces. Use for labeling piece names, adding sewing instructions, marking grain lines, or any other text notes. Text annotations are included when printing or exporting patterns.',
    examples: [
      'Add a label to this piece',
      'Write "Front Bodice" on the pattern',
      'Add sewing instructions',
      'Label the grain line direction',
    ],
    keywords: ['text', 'label', 'annotation', 'note', 'write', 'name', 'instructions', 'mark'],
    requiresSelection: 'piece',
    produces: 'none',
    undoable: true,
  },
};