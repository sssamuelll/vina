/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
/**
 * #82 — Tool-UI Bridge: Missing copilot equivalents for UI tools
 * duplicatePiece, addAnnotation, quickRectangle, selectTool, setViewMode
 */

import type { ToolDefinition } from '../registry';
import { duplicatePiece } from '../../../../store/projectSlice';
import { addInternalLine } from '../../../../store/projectSlice';
import { setActiveTool, setViewMode, selectPiece, clearSelection } from '../../../../store/editorSlice';
import type { InternalLine } from '../../../../types/types';

export const tools: ToolDefinition[] = [
  {
    name: 'duplicatePiece',
    description: 'Duplicate a pattern piece with offset. Creates an exact copy.',
    parameters: {
      type: 'object',
      properties: {
        pieceId: { type: 'string', description: 'ID of piece to duplicate' },
      },
      required: ['pieceId'],
    },
    execute: async (params, dispatch, getState) => {
      const pieces = getState().project.pieces;
      const piece = pieces.find((p: any) => p.id === params.pieceId);
      if (!piece) return { success: false, error: `Piece ${params.pieceId} not found` };
      dispatch(duplicatePiece(params.pieceId as string));
      const newPieces = getState().project.pieces;
      const newPiece = newPieces[newPieces.length - 1];
      return { success: true, newPieceId: newPiece?.id, newPieceName: newPiece?.name };
    },
  },
  {
    name: 'addAnnotation',
    description: 'Add a text annotation to a pattern piece as an internal line.',
    parameters: {
      type: 'object',
      properties: {
        pieceId: { type: 'string', description: 'Piece ID' },
        text: { type: 'string', description: 'Annotation text' },
        x: { type: 'number', description: 'X position (mm)' },
        y: { type: 'number', description: 'Y position (mm)' },
      },
      required: ['pieceId', 'text'],
    },
    execute: async (params, dispatch, getState) => {
      const pieces = getState().project.pieces;
      const piece = pieces.find((p: any) => p.id === params.pieceId);
      if (!piece) return { success: false, error: `Piece ${params.pieceId} not found` };
      const line: InternalLine = {
        id: `ann_${Date.now()}_${params.text}`,
        type: 'fold',
        path: [
          { type: 'M', values: [Number(params.x) || 0, Number(params.y) || 0] },
          { type: 'L', values: [(Number(params.x) || 0) + 50, Number(params.y) || 0] },
        ],
      };
      dispatch(addInternalLine({ pieceId: params.pieceId as string, line }));
      return { success: true, annotationId: line.id, text: params.text };
    },
  },
  {
    name: 'quickRectangle',
    description: 'Create a rectangular pattern piece with given dimensions.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Piece name' },
        width: { type: 'number', description: 'Width in mm' },
        height: { type: 'number', description: 'Height in mm' },
        x: { type: 'number', description: 'X position (mm, default 0)' },
        y: { type: 'number', description: 'Y position (mm, default 0)' },
      },
      required: ['name', 'width', 'height'],
    },
    execute: async (params, dispatch, _getState) => {
      const { addPiece } = await import('../../../../store/projectSlice');
      const w = Number(params.width);
      const h = Number(params.height);
      const x = Number(params.x) || 0;
      const y = Number(params.y) || 0;
      const id = `piece_${Date.now()}`;
      dispatch(addPiece({
        id,
        name: params.name as string,
        outline: [
          { type: 'M', values: [0, 0] },
          { type: 'L', values: [w, 0] },
          { type: 'L', values: [w, h] },
          { type: 'L', values: [0, h] },
          { type: 'Z', values: [] },
        ],
        internals: [],
        position: { x, y },
        rotation: 0,
        seamAllowance: 10,
      } as any));
      return { success: true, pieceId: id, name: params.name, width: w, height: h };
    },
  },
  {
    name: 'activateTool',
    description: 'Switch the active editor tool (select, pen, seam, notch, grainline, line, measure, etc.).',
    parameters: {
      type: 'object',
      properties: {
        tool: { type: 'string', description: 'Tool name to activate' },
      },
      required: ['tool'],
    },
    execute: async (params, dispatch) => {
      dispatch(setActiveTool(params.tool as any));
      return { success: true, activeTool: params.tool };
    },
  },
  {
    name: 'switchViewMode',
    description: 'Switch editor view mode: "2d", "3d", or "split".',
    parameters: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['2d', '3d', 'split'], description: 'View mode' },
      },
      required: ['mode'],
    },
    execute: async (params, dispatch) => {
      dispatch(setViewMode(params.mode as any));
      return { success: true, viewMode: params.mode };
    },
  },
  {
    name: 'selectPieceById',
    description: 'Select a piece by ID in the editor (highlights it).',
    parameters: {
      type: 'object',
      properties: {
        pieceId: { type: 'string', description: 'Piece ID to select' },
      },
      required: ['pieceId'],
    },
    execute: async (params, dispatch, getState) => {
      const pieces = getState().project.pieces;
      const piece = pieces.find((p: any) => p.id === params.pieceId);
      if (!piece) return { success: false, error: `Piece ${params.pieceId} not found` };
      dispatch(selectPiece(params.pieceId as string));
      return { success: true, selected: params.pieceId, name: piece.name };
    },
  },
  {
    name: 'clearEditorSelection',
    description: 'Deselect all pieces in the editor.',
    parameters: { type: 'object', properties: {} },
    execute: async (_params, dispatch) => {
      dispatch(clearSelection());
      return { success: true };
    },
  },
];
