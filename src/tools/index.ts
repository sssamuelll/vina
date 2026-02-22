import { toolRegistry } from './registry';

// Import all tool definitions
import { selectTool } from './definitions/select';
import { penTool } from './definitions/pen';
import { lineTool } from './definitions/line';
import { rectangleTool } from './definitions/rectangle';
import { seamTool } from './definitions/seam';
import { notchTool } from './definitions/notch';
import { grainlineTool } from './definitions/grainline';
import { measureTool } from './definitions/measure';
import { handTool } from './definitions/hand';
import { cameraTool } from './definitions/camera';
import { edit3dTool } from './definitions/edit3d';
import { poseTool } from './definitions/pose';
import { avatarTool } from './definitions/avatar';

// Register all tools
const allTools = [
  // 2D Tools
  selectTool,
  penTool,
  lineTool,
  rectangleTool,
  seamTool,
  notchTool,
  grainlineTool,
  measureTool,
  handTool,
  
  // 3D Tools
  cameraTool,
  edit3dTool,
  poseTool,
  avatarTool,
];

// Auto-register all tools
allTools.forEach(tool => {
  toolRegistry.registerTool(tool);
});

// Export the registry and types for use by other modules
export { toolRegistry } from './registry';
export type { ToolDefinition, ToolOption, ToolContext } from './types';