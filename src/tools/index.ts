import { toolRegistry } from './registry';

// Import all tool definitions
import { selectTool } from './definitions/select';
import { editCurveTool } from './definitions/editCurve';
import { editPatternTool } from './definitions/editPattern';
import { editConstrainTool } from './definitions/editConstrain';
import { movePatternTool } from './definitions/movePattern';
import { copyPatternTool } from './definitions/copyPattern';
import { transformTool } from './definitions/transform';
import { penTool } from './definitions/pen';
import { lineTool } from './definitions/line';
import { internalShapeTool } from './definitions/internalShape';
import { rectangleTool } from './definitions/rectangle';
import { seamTool } from './definitions/seam';
import { segmentSewingTool } from './definitions/segmentSewing';
import { topstitchSeamlineTool } from './definitions/topstitchSeamline';
import { topstitchSegmentTool } from './definitions/topstitchSegment';
import { topstitchFreeTool } from './definitions/topstitchFree';
import { topstitchEditTool } from './definitions/topstitchEdit';
import { seamAllowanceTool } from './definitions/seamAllowance';
import { notchTool } from './definitions/notch';
import { grainlineTool } from './definitions/grainline';
import { duplicateTool } from './definitions/duplicate';
import { gradingTool } from './definitions/grading';
import { textAnnotationTool } from './definitions/textAnnotation';
import { elasticTool } from './definitions/elastic';
import { pleatTool } from './definitions/pleat';
import { addPieceTool } from './definitions/addPiece';
import { fabricTextureTool } from './definitions/fabricTexture';
import { flattenTool } from './definitions/flatten';
import { measureTool } from './definitions/measure';
import { measureCurveTool } from './definitions/measureCurve';
import { compareCurvesTool } from './definitions/compareCurves';
import { walkSeamTool } from './definitions/walkSeam';
import { handTool } from './definitions/hand';
import { zoomTool } from './definitions/zoom';
import { cameraTool } from './definitions/camera';
import { edit3dTool } from './definitions/edit3d';
import { sew3dTool } from './definitions/sew3d';
// pose tool removed — pose controls are inside AvatarPanel
import { avatarTool } from './definitions/avatar';
import { tapeMeasureCircTool, tapeMeasureLinearTool } from './definitions/avatarTape';
import { scissorsTool } from './definitions/scissors';
import { slashAndSpreadTool } from './definitions/slashAndSpread';
import { mergeTool } from './definitions/merge';
import { dartTool } from './definitions/dart';
import { circleTool } from './definitions/circle';
import { polyPenTool } from './definitions/polyPen';
import { mirrorTool } from './definitions/mirror';
import { traceTool } from './definitions/trace';
import { autoTraceTool } from './definitions/autoTrace';
import { freeSewingTool } from './definitions/freeSewing';
import { arrangementTool } from './definitions/arrangement';
import { pinTool } from './definitions/pin';
import { simulateTool } from './definitions/simulate';
import { steamBrushTool } from './definitions/steamBrush';
import { meshGrabTool } from './definitions/meshGrab';
import { meshSelectBoxTool, meshSelectLassoTool } from './definitions/meshSelect';
import { pomMeasureTool } from './definitions/pomMeasure';
import { offsetOutlineTool } from './definitions/offsetOutline';
import { extendTrimTool } from './definitions/extendTrim';
import { renderTools } from './renderTools';

// Register all tools
const allTools = [
  // 2D Tools — Selection & Transform
  selectTool,
  editPatternTool,
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
  autoTraceTool,
  circleTool,
  polyPenTool,

  // 2D Tools — Pattern Editing
  scissorsTool,
  slashAndSpreadTool,
  mergeTool,
  mirrorTool,
  duplicateTool,
  addPieceTool,
  fabricTextureTool,
  flattenTool,
  offsetOutlineTool,
  extendTrimTool,
  
  // 2D Tools — Sewing
  seamTool,
  segmentSewingTool,
  topstitchSeamlineTool,
  topstitchSegmentTool,
  topstitchFreeTool,
  topstitchEditTool,
  seamAllowanceTool,
  elasticTool,
  pleatTool,
  freeSewingTool,
  
  // 2D Tools — Annotation
  notchTool,
  grainlineTool,
  gradingTool,
  textAnnotationTool,
  measureTool,
  measureCurveTool,
  compareCurvesTool,
  walkSeamTool,
  pomMeasureTool,

  // 2D Tools — Navigation
  handTool,
  zoomTool,
  
  // 3D Tools — Navigation
  cameraTool,
  
  // 3D Tools — Arrangement
  arrangementTool,
  pinTool,
  meshSelectBoxTool,
  meshSelectLassoTool,
  
  // 3D Tools — Editing
  edit3dTool,
  sew3dTool,
  
  // 3D Tools — Avatar (pose is inside AvatarPanel)
  avatarTool,
  tapeMeasureCircTool,
  tapeMeasureLinearTool,
  
  // 3D Tools — Simulation
  simulateTool,
  steamBrushTool,
  meshGrabTool,

  // 3D Tools — Render (copilot-only, hidden from toolbar)
  ...renderTools,
];

// Auto-register all tools
allTools.forEach(tool => {
  toolRegistry.registerTool(tool);
});

// Export the registry and types for use by other modules
export { toolRegistry } from './registry';
export type { ToolDefinition, ToolOption, ToolContext, CopilotToolMetadata } from './types';

// Export copilot schema utilities
export {
  generateToolSchemas,
  toOpenAIFunctions,
  toAnthropicTools,
  generateToolsPromptSection,
  findToolsByQuery,
  toolToSchema,
} from './copilotSchemas';
export type {
  CopilotToolSchema,
  OpenAIFunctionSchema,
  AnthropicToolSchema,
} from './copilotSchemas';