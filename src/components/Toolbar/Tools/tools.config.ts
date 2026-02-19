import { BaseTool } from './core/BaseTool';
import * as DrawingTools from './drawing';
import * as NavigationTools from './navigation';
import * as AnnotationTools from './annotation';
import * as SelectionTools from './selection';


export const TOOLS = {
  'drawing/pencil': DrawingTools.PencilTool,
  'drawing/rectangle': DrawingTools.RectangleTool,
  'navigation/hand': NavigationTools.HandTool,
  'annotation/comment': AnnotationTools.CommentTool,
  'selection/pointer': SelectionTools.SelectionTool,
  
} as const satisfies Record<string, new (...args: unknown[]) => BaseTool>;

export type ToolId = keyof typeof TOOLS;
export type ToolCategory = BaseTool['category'];