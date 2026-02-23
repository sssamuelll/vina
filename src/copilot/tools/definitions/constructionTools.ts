/**
 * Construction Engine Tools — copilot tools for parametric pattern building.
 * 
 * These tools let the AI (or user) build patterns step by step:
 * point → line → curve → piece. Each step is visible, named, and editable.
 * 
 * @module constructionTools
 */

import type { ToolDefinition, ToolResult } from '../registry';
import type { PointDefinition, PieceNode } from '../../../types/construction';
import {
  addPoint, addLine, addCurve,
  addConstructionPiece, clearConstruction,
  setVariable, setShowConstruction,
} from '../../../store/constructionSlice';
import { addPiece } from '../../../store/projectSlice';
import { selectPiece } from '../../../store/editorSlice';
import { buildPiece } from '../../../utils/construction/pieceBuilder';
import { resolveConstructionPoints } from '../../../utils/construction/resolver';

// ─── addConstructionPoint ───────────────────────────────────────────────────

const addConstructionPointTool: ToolDefinition = {
  name: 'addConstructionPoint',
  description:
    'Add a named construction point. Points are the foundation of pattern building. ' +
    'Types: absolute (x,y), endLine (from base point at angle+distance), alongLine (fraction along a line), ' +
    'normal (perpendicular from a line), midpoint. Use formulas referencing measurements (e.g., "chest/4+10"). ' +
    '/ Añadir un punto de construcción nombrado.',
  parameters: {
    type: 'object',
    properties: {
      label: { type: 'string', description: 'Point name (e.g., "A", "neckPoint", "bustApex") / Nombre del punto' },
      type: {
        type: 'string',
        enum: ['absolute', 'endLine', 'alongLine', 'normal', 'midpoint', 'manual'],
        description: 'How the point is defined / Tipo de definición',
      },
      // For absolute/manual
      x: { type: 'number', description: 'X coordinate in mm (for absolute/manual)' },
      y: { type: 'number', description: 'Y coordinate in mm (for absolute/manual)' },
      // For endLine
      basePoint: { type: 'string', description: 'Base point label (for endLine)' },
      angle: { type: 'number', description: 'Angle in degrees (for endLine/normal)' },
      length: { type: 'number', description: 'Distance in mm — can use formula string (for endLine/alongLine/normal)' },
      // For alongLine / normal / midpoint
      from: { type: 'string', description: 'Start point label (for alongLine/normal/midpoint)' },
      to: { type: 'string', description: 'End point label (for alongLine/normal/midpoint)' },
    },
    required: ['label', 'type'],
  },
  execute: async (params, dispatch): Promise<ToolResult> => {
    const label = params.label as string;
    const type = params.type as string;

    let definition: PointDefinition;

    switch (type) {
      case 'absolute':
        definition = { type: 'absolute', x: (params.x as number) ?? 0, y: (params.y as number) ?? 0 };
        break;
      case 'manual':
        definition = { type: 'manual', x: (params.x as number) ?? 0, y: (params.y as number) ?? 0 };
        break;
      case 'endLine':
        definition = {
          type: 'endLine',
          basePoint: params.basePoint as string,
          angle: (params.angle as number) ?? 0,
          length: (params.length as number) ?? 0,
        };
        break;
      case 'alongLine':
        definition = {
          type: 'alongLine',
          from: params.from as string,
          to: params.to as string,
          length: (params.length as number) ?? 0,
        };
        break;
      case 'normal':
        definition = {
          type: 'normal',
          from: params.from as string,
          to: params.to as string,
          angle: (params.angle as number) ?? 90,
          length: (params.length as number) ?? 0,
        };
        break;
      case 'midpoint':
        definition = { type: 'midpoint', from: params.from as string, to: params.to as string };
        break;
      default:
        return { success: false, error: `Unknown point type: ${type}` };
    }

    dispatch(addPoint({ label, definition }));
    return { success: true, data: { label, type } };
  },
};

// ─── addConstructionLine ────────────────────────────────────────────────────

const addConstructionLineTool: ToolDefinition = {
  name: 'addConstructionLine',
  description:
    'Add a construction line between two named points. Lines are visual guides and can be used as references for other constructions. ' +
    '/ Añadir una línea de construcción entre dos puntos.',
  parameters: {
    type: 'object',
    properties: {
      label: { type: 'string', description: 'Line name / Nombre de la línea' },
      from: { type: 'string', description: 'Start point label / Punto inicio' },
      to: { type: 'string', description: 'End point label / Punto fin' },
      style: { type: 'string', enum: ['solid', 'dashed', 'construction'], description: 'Line style (default: construction)' },
    },
    required: ['label', 'from', 'to'],
  },
  execute: async (params, dispatch): Promise<ToolResult> => {
    dispatch(addLine({
      label: params.label as string,
      from: params.from as string,
      to: params.to as string,
      style: (params.style as 'solid' | 'dashed' | 'construction') ?? 'construction',
    }));
    return { success: true };
  },
};

// ─── addConstructionCurve ───────────────────────────────────────────────────

const addConstructionCurveTool: ToolDefinition = {
  name: 'addConstructionCurve',
  description:
    'Add a construction curve (spline) between two points. Used for armholes, necklines, and other curved seams. ' +
    'Angles control the direction at each endpoint. Lengths control how far the control points extend. ' +
    '/ Añadir una curva de construcción entre dos puntos.',
  parameters: {
    type: 'object',
    properties: {
      label: { type: 'string', description: 'Curve name / Nombre de la curva' },
      from: { type: 'string', description: 'Start point label / Punto inicio' },
      to: { type: 'string', description: 'End point label / Punto fin' },
      angle1: { type: 'number', description: 'Departure angle at start point (degrees)' },
      angle2: { type: 'number', description: 'Arrival angle at end point (degrees)' },
      length1: { type: 'number', description: 'Control point distance at start (mm)' },
      length2: { type: 'number', description: 'Control point distance at end (mm)' },
    },
    required: ['label', 'from', 'to', 'angle1', 'angle2', 'length1', 'length2'],
  },
  execute: async (params, dispatch): Promise<ToolResult> => {
    dispatch(addCurve({
      label: params.label as string,
      definition: {
        type: 'spline',
        from: params.from as string,
        to: params.to as string,
        angle1: params.angle1 as number,
        angle2: params.angle2 as number,
        length1: params.length1 as number,
        length2: params.length2 as number,
      },
    }));
    return { success: true };
  },
};

// ─── buildPieceFromConstruction ─────────────────────────────────────────────

const buildPieceFromConstructionTool: ToolDefinition = {
  name: 'buildPieceFromConstruction',
  description:
    'Build a pattern piece from construction points. Specify an ordered list of point labels ' +
    'that form the piece outline. Optionally specify curves between consecutive points. ' +
    'This creates a real PatternPiece that can be simulated, exported, etc. ' +
    '/ Construir una pieza de patrón desde puntos de construcción.',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Piece name / Nombre de la pieza' },
      points: {
        type: 'array',
        description: 'Ordered list of point labels forming the outline / Lista ordenada de puntos',
        items: { type: 'string' },
      },
      curves: {
        type: 'array',
        description: 'Optional: curve labels between consecutive points. Use null for straight lines. / Curvas entre puntos consecutivos',
        items: { type: 'string' },
      },
      seamAllowance: { type: 'number', description: 'Seam allowance in mm (default 10)' },
    },
    required: ['name', 'points'],
  },
  execute: async (params, dispatch, getState): Promise<ToolResult> => {
    const state = getState();
    const construction = state.construction;
    const pointLabels = params.points as string[];
    const curveLabels = (params.curves as (string | null)[] | undefined) ?? [];

    // Build nodes
    const nodes: PieceNode[] = pointLabels.map((label, i) => {
      // Find point by label
      const point = construction.points.find(p => p.label === label);
      if (!point) throw new Error(`Point "${label}" not found`);

      const curveLbl = curveLabels[i] ?? null;
      const curve = curveLbl ? construction.curves.find(c => c.label === curveLbl) : null;

      return {
        pointId: point.id,
        connection: curve ? 'curve' as const : 'line' as const,
        curveId: curve?.id,
      };
    });

    // Save construction piece definition
    const cPieceName = params.name as string;
    dispatch(addConstructionPiece({
      name: cPieceName,
      nodes,
      seamAllowance: (params.seamAllowance as number) ?? 10,
    }));

    // Build the actual PatternPiece
    const measurements = state.project.avatar.measurements as unknown as Record<string, number>;
    const ctx = { measurements, variables: construction.variables as Record<string, number> };
    const cPiece = {
      id: 'temp',
      name: cPieceName,
      nodes,
      seamAllowance: (params.seamAllowance as number) ?? 10,
      closed: true,
    };

    try {
      const piece = buildPiece(cPiece, construction.points, construction.curves, ctx);
      dispatch(addPiece(piece));
      dispatch(selectPiece(piece.id));

      return {
        success: true,
        data: {
          pieceId: piece.id,
          name: piece.name,
          pointCount: pointLabels.length,
        },
      };
    } catch (e) {
      return { success: false, error: `Build failed: ${(e as Error).message}` };
    }
  },
};

// ─── resolveConstruction ────────────────────────────────────────────────────

const resolveConstructionTool: ToolDefinition = {
  name: 'resolveConstruction',
  description:
    'Resolve all construction points to concrete coordinates using current measurements. ' +
    'Call this after adding points to verify positions. Returns resolved coordinates and any errors. ' +
    '/ Resolver todos los puntos de construcción con las medidas actuales.',
  parameters: {
    type: 'object',
    properties: {},
  },
  execute: async (_params, dispatch, getState): Promise<ToolResult> => {
    const state = getState();
    const { points, variables } = state.construction;
    const measurements = state.project.avatar.measurements as unknown as Record<string, number>;

    const result = resolveConstructionPoints(points, measurements, variables);

    // Update store with resolved positions
    const { resolveAll } = await import('../../../store/constructionSlice');
    dispatch(resolveAll({ resolved: result.resolved }));

    return {
      success: true,
      data: {
        pointCount: result.resolved.length,
        errors: result.errors.length > 0 ? result.errors : undefined,
        points: result.resolved.map(r => {
          const pt = points.find(p => p.id === r.id);
          return { label: pt?.label ?? r.id, x: Math.round(r.x * 10) / 10, y: Math.round(r.y * 10) / 10 };
        }),
      },
    };
  },
};

// ─── clearConstruction ──────────────────────────────────────────────────────

const clearConstructionTool: ToolDefinition = {
  name: 'clearConstruction',
  description: 'Clear all construction geometry (points, lines, curves, pieces). / Limpiar toda la geometría de construcción.',
  parameters: { type: 'object', properties: {} },
  execute: async (_params, dispatch): Promise<ToolResult> => {
    dispatch(clearConstruction());
    return { success: true };
  },
};

// ─── setConstructionVariable ────────────────────────────────────────────────

const setConstructionVariableTool: ToolDefinition = {
  name: 'setConstructionVariable',
  description:
    'Set a named variable for use in construction formulas. Variables can reference measurements. ' +
    'Example: setConstructionVariable("halfChest", 480) or use formulas. ' +
    '/ Definir una variable para usar en fórmulas de construcción.',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Variable name / Nombre de la variable' },
      value: { type: 'number', description: 'Value in mm / Valor en mm' },
    },
    required: ['name', 'value'],
  },
  execute: async (params, dispatch): Promise<ToolResult> => {
    dispatch(setVariable({ name: params.name as string, value: params.value as number }));
    return { success: true };
  },
};

// ─── toggleConstructionOverlay ──────────────────────────────────────────────

const toggleConstructionOverlayTool: ToolDefinition = {
  name: 'toggleConstructionOverlay',
  description: 'Show or hide construction points and lines on the 2D canvas. / Mostrar u ocultar puntos y líneas de construcción.',
  parameters: {
    type: 'object',
    properties: {
      visible: { type: 'boolean', description: 'Show construction (default: toggle)' },
    },
  },
  execute: async (params, dispatch): Promise<ToolResult> => {
    if (params.visible !== undefined) {
      dispatch(setShowConstruction(params.visible as boolean));
    } else {
      const { toggleConstruction } = await import('../../../store/constructionSlice');
      dispatch(toggleConstruction());
    }
    return { success: true };
  },
};

// ─── Export ─────────────────────────────────────────────────────────────────

export const tools: ToolDefinition[] = [
  addConstructionPointTool,
  addConstructionLineTool,
  addConstructionCurveTool,
  buildPieceFromConstructionTool,
  resolveConstructionTool,
  clearConstructionTool,
  setConstructionVariableTool,
  toggleConstructionOverlayTool,
];
