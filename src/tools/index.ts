import { toolRegistry } from './registry';

// Import all tool definitions
import { selectTool } from './definitions/select';
import { transformTool } from './definitions/transform';
import { penTool } from './definitions/pen';
import { lineTool } from './definitions/line';
import { rectangleTool } from './definitions/rectangle';
import { seamTool } from './definitions/seam';
import { notchTool } from './definitions/notch';
import { grainlineTool } from './definitions/grainline';
import { measureTool } from './definitions/measure';
import { handTool } from './definitions/hand';
import { zoomTool } from './definitions/zoom';
import { cameraTool } from './definitions/camera';
import { edit3dTool } from './definitions/edit3d';
import { poseTool } from './definitions/pose';
import { avatarTool } from './definitions/avatar';
import { scissorsTool } from './definitions/scissors';
import { dartTool } from './definitions/dart';
import { circleTool } from './definitions/circle';
import { mirrorTool } from './definitions/mirror';
import { traceTool } from './definitions/trace';
import { freeSewingTool } from './definitions/freeSewing';
import { arrangementTool } from './definitions/arrangement';
import { pinTool } from './definitions/pin';
import { simulateTool } from './definitions/simulate';

// Register all tools
const allTools = [
  // 2D Tools — Selection & Transform
  selectTool,
  transformTool,
  
  // 2D Tools — Drawing
  penTool,
  lineTool,
  rectangleTool,
  dartTool,
  traceTool,
  circleTool,
  
  // 2D Tools — Pattern Editing
  scissorsTool,
  mirrorTool,
  
  // 2D Tools — Sewing
  seamTool,
  freeSewingTool,
  
  // 2D Tools — Annotation
  notchTool,
  grainlineTool,
  measureTool,
  
  // 2D Tools — Navigation
  handTool,
  zoomTool,
  
  // 3D Tools — Navigation
  cameraTool,
  
  // 3D Tools — Arrangement
  arrangementTool,
  pinTool,
  
  // 3D Tools — Editing
  edit3dTool,
  
  // 3D Tools — Avatar
  poseTool,
  avatarTool,
  
  // 3D Tools — Simulation
  simulateTool,
];

// Auto-register all tools
allTools.forEach(tool => {
  toolRegistry.registerTool(tool);
});

// Export the registry and types for use by other modules
export { toolRegistry } from './registry';
export type { ToolDefinition, ToolOption, ToolContext } from './types';