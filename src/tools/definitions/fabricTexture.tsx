import React from 'react';
import { ToolDefinition } from '../types';

const FabricTextureIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
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
    {/* Checkered pattern swatch */}
    <rect x="2" y="2" width="14" height="14"/>
    {/* Checkers */}
    <rect x="2" y="2" width="4" height="4" fill="currentColor" fillOpacity="0.3"/>
    <rect x="10" y="2" width="4" height="4" fill="currentColor" fillOpacity="0.3"/>
    <rect x="6" y="6" width="4" height="4" fill="currentColor" fillOpacity="0.3"/>
    <rect x="2" y="10" width="4" height="4" fill="currentColor" fillOpacity="0.3"/>
    <rect x="10" y="10" width="4" height="4" fill="currentColor" fillOpacity="0.3"/>
    <rect x="14" y="14" width="2" height="2" fill="currentColor" fillOpacity="0.3"/>
  </svg>
);

export const fabricTextureTool: ToolDefinition = {
  id: 'fabricTexture',
  name: 'Fabric / Texture',
  context: '2d',
  icon: FabricTextureIcon,
  cursor: 'default',
  group: 'pattern',
};