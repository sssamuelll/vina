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
};