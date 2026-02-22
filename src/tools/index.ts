import { toolRegistry } from './registry';

// Import all tool definitions
import { selectTool } from './definitions/select';
import { editCurveTool } from './definitions/editCurve';
import { editConstrainTool } from './definitions/editConstrain';
import { movePatternTool } from './definitions/movePattern';
import { copyPatternTool } from './definitions/copyPattern';
import { transformTool } from './definitions/transform';
import { penTool } from './definitions/pen';
import { lineTool } from './definitions/line';
import { internalShapeTool } from './definitions/internalShape';
import { rectangleTool } from './definitions/rectangle';
import { seamTool } from './definitions/seam';
import { seamAllowanceTool } from './definitions/seamAllowance';
import { notchTool } from './definitions/notch';
import { grainlineTool } from './definitions/grainline';
import { duplicateTool } from './definitions/duplicate';
import { gradingTool } from './definitions/grading';
import { textAnnotationTool } from './definitions/textAnnotation';
import { elasticTool } from './definitions/elastic';
import { addPieceTool } from './definitions/addPiece';
import { fabricTextureTool } from './definitions/fabricTexture';
import { flattenTool } from './definitions/flatten';
import { measureTool } from './definitions/measure';
import { handTool } from './definitions/hand';
import { zoomTool } from './definitions/zoom';
import { cameraTool } from './definitions/camera';
import { edit3dTool } from './definitions/edit3d';
// pose tool removed — pose controls are inside AvatarPanel
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
  editCurveTool,
  editConstrainTool,
  movePatternTool,
  copyPatternTool,
  transformTool,
  
  // 2D Tools — Drawing
  penTool,
  lineTool,
  internalShapeTool,
  rectangleTool,
  dartTool,
  traceTool,
  circleTool,
  
  // 2D Tools — Pattern Editing
  scissorsTool,
  mirrorTool,
  duplicateTool,
  addPieceTool,
  fabricTextureTool,
  flattenTool,
  
  // 2D Tools — Sewing
  seamTool,
  seamAllowanceTool,
  elasticTool,
  freeSewingTool,
  
  // 2D Tools — Annotation
  notchTool,
  grainlineTool,
  gradingTool,
  textAnnotationTool,
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
  
  // 3D Tools — Avatar (pose is inside AvatarPanel)
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