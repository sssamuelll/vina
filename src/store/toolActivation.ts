import type { Dispatch } from '@reduxjs/toolkit';
import { setActiveTool } from './editorSlice';
import { setActiveTool2D } from './toolSlice';
import type { Tool2D } from '../types/types';

/**
 * The single writer for 2D tool activation.
 *
 * `editor.activeTool` is the drawing-engine truth (what a canvas click does);
 * `tools.activeTool2D` is the per-tool-options key + the gate for the two tools
 * (measure, walkSeam) built to read it. They are different facts, not copies —
 * so every activation site MUST set both, or a tool silently half-activates.
 * Route all 2D tool activation through here instead of hand-writing the pair.
 *
 * `id` is `string` (not `Tool2D`) because legacy bindings activate ids that
 * aren't in the union (circle/trace/dart/pin); the cast is centralized here.
 */
export function activate2DTool(dispatch: Dispatch, id: string): void {
  dispatch(setActiveTool(id as Tool2D));
  dispatch(setActiveTool2D(id));
}
