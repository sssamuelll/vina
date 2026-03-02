/**
 * Analysis Tools — read-only measurement, piece analysis, and project overview.
 * Herramientas de Análisis — medición, análisis de piezas y resumen del proyecto (solo lectura).
 *
 * @module analysisTools
 */

import type { ToolDefinition, ToolResult } from '../registry';
import { computeArea } from '../../../../utils/nesting';

// ─── measureDistance ────────────────────────────────────────────────────────

const measureDistanceTool: ToolDefinition = {
  name: 'measureDistance',
  description:
    'Measure distance between two points or along a piece edge/perimeter. ' +
    '/ Medir distancia entre dos puntos o a lo largo de un borde/perímetro de pieza.',
  parameters: {
    type: 'object',
    properties: {
      mode: {
        type: 'string',
        enum: ['point-to-point', 'edge-length', 'piece-perimeter'],
        description: 'Measurement mode / Modo de medición',
      },
      pieceId: { type: 'string', description: 'Piece ID (for edge/perimeter modes) / ID de pieza' },
      pointA: {
        type: 'object',
        properties: { x: { type: 'number' }, y: { type: 'number' } },
        description: 'First point / Primer punto',
      },
      pointB: {
        type: 'object',
        properties: { x: { type: 'number' }, y: { type: 'number' } },
        description: 'Second point / Segundo punto',
      },
    },
    required: ['mode'],
  },
  execute: async (params, _dispatch, getState): Promise<ToolResult> => {
    const state = getState();
    const mode = params.mode as string;

    if (mode === 'point-to-point') {
      const a = params.pointA as { x: number; y: number };
      const b = params.pointB as { x: number; y: number };
      if (!a || !b) return { success: false, error: 'pointA and pointB are required for point-to-point mode' };

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      return { success: true, data: { distance: Math.round(distance * 10) / 10, unit: 'mm' } };
    }

    const pieceId = params.pieceId as string;
    if (!pieceId) return { success: false, error: 'pieceId is required for edge/perimeter modes' };

    const piece = state.project.pieces.find(p => p.id === pieceId);
    if (!piece) return { success: false, error: `Piece "${pieceId}" not found` };

    const { flattenPath } = await import('../../../../utils/seam/index');
    const points = flattenPath(piece.outline);

    if (mode === 'piece-perimeter') {
      let perimeter = 0;
      for (let i = 0; i < points.length - 1; i++) {
        const dx = points[i + 1].x - points[i].x;
        const dy = points[i + 1].y - points[i].y;
        perimeter += Math.sqrt(dx * dx + dy * dy);
      }
      // Close the path
      if (points.length > 1) {
        const dx = points[0].x - points[points.length - 1].x;
        const dy = points[0].y - points[points.length - 1].y;
        perimeter += Math.sqrt(dx * dx + dy * dy);
      }
      return { success: true, data: { distance: Math.round(perimeter * 10) / 10, unit: 'mm' } };
    }

    // edge-length: measure the full outline length (same as perimeter for now)
    let length = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const dx = points[i + 1].x - points[i].x;
      const dy = points[i + 1].y - points[i].y;
      length += Math.sqrt(dx * dx + dy * dy);
    }
    return { success: true, data: { distance: Math.round(length * 10) / 10, unit: 'mm' } };
  },
};

// ─── analyzePiece ───────────────────────────────────────────────────────────

const analyzePieceTool: ToolDefinition = {
  name: 'analyzePiece',
  description:
    'Get detailed analysis of a pattern piece: area, perimeter, bounding box, curves, darts. ' +
    '/ Obtener análisis detallado de una pieza: área, perímetro, caja contenedora, curvas, pinzas.',
  parameters: {
    type: 'object',
    properties: {
      pieceId: { type: 'string', description: 'Piece ID / ID de la pieza' },
    },
    required: ['pieceId'],
  },
  execute: async (params, _dispatch, getState): Promise<ToolResult> => {
    const state = getState();
    const piece = state.project.pieces.find(p => p.id === (params.pieceId as string));
    if (!piece) return { success: false, error: `Piece "${params.pieceId}" not found` };

    const { flattenPath } = await import('../../../../utils/seam/index');
    const points = flattenPath(piece.outline);

    // Area
    const area = computeArea(piece.outline);

    // Perimeter
    let perimeter = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const dx = points[i + 1].x - points[i].x;
      const dy = points[i + 1].y - points[i].y;
      perimeter += Math.sqrt(dx * dx + dy * dy);
    }

    // Bounding box
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const cmd of piece.outline) {
      for (let i = 0; i < cmd.values.length - 1; i += 2) {
        minX = Math.min(minX, cmd.values[i]);
        minY = Math.min(minY, cmd.values[i + 1]);
        maxX = Math.max(maxX, cmd.values[i]);
        maxY = Math.max(maxY, cmd.values[i + 1]);
      }
    }

    // Count curves
    const numCurves = piece.outline.filter(c => c.type === 'C' || c.type === 'Q').length;

    // Count internals
    const numDarts = piece.internals.filter(i => i.type === 'dart').length;
    const numNotches = piece.internals.filter(i => i.type === 'notch').length;
    const hasGrainline = piece.internals.some(i => i.type === 'grainline');

    return {
      success: true,
      data: {
        name: piece.name,
        area: Math.round(area),
        perimeter: Math.round(perimeter),
        bounds: {
          width: Math.round(maxX - minX),
          height: Math.round(maxY - minY),
        },
        numCurves,
        numDarts,
        numNotches,
        hasGrainline,
        seamAllowance: piece.seamAllowance,
      },
    };
  },
};

// ─── analyzeProject ─────────────────────────────────────────────────────────

const analyzeProjectTool: ToolDefinition = {
  name: 'analyzeProject',
  description:
    'Get overview of the entire project: piece count, total area, seam connections, issues. ' +
    '/ Obtener resumen del proyecto: cantidad de piezas, área total, conexiones de costura, problemas.',
  parameters: {
    type: 'object',
    properties: {},
  },
  execute: async (_params, _dispatch, getState): Promise<ToolResult> => {
    const state = getState();
    const { pieces, seams } = state.project;

    let totalArea = 0;
    const issues: string[] = [];

    for (const piece of pieces) {
      totalArea += computeArea(piece.outline);

      // Check for missing grainline
      if (!piece.internals.some(i => i.type === 'grainline')) {
        issues.push(`${piece.name} has no grainline / no tiene línea de hilo`);
      }

      // Check for missing seam allowance
      if (piece.seamAllowance === 0) {
        issues.push(`${piece.name} has no seam allowance / no tiene margen de costura`);
      }
    }

    return {
      success: true,
      data: {
        pieceCount: pieces.length,
        totalArea: Math.round(totalArea),
        seamCount: seams.length,
        issues,
        measurements: state.project.avatar.measurements as unknown as Record<string, unknown>,
      },
    };
  },
};

// ─── evaluateFormula ────────────────────────────────────────────────────────

const evaluateFormulaTool: ToolDefinition = {
  name: 'evaluateFormula',
  description:
    "Evaluate a parametric formula using body measurements as variables (e.g. 'chest / 4 + 2'). " +
    "/ Evaluar una fórmula paramétrica usando medidas corporales como variables (e.g. 'chest / 4 + 2').",
  parameters: {
    type: 'object',
    properties: {
      formula: { type: 'string', description: "Formula expression / Expresión de fórmula (e.g. 'chest / 4 + 2')" },
      extraVariables: { type: 'object', description: 'Additional variables beyond measurements / Variables adicionales' },
    },
    required: ['formula'],
  },
  execute: async (params, _dispatch, getState): Promise<ToolResult> => {
    const state = getState();
    const { evaluateFormula } = await import('../../../../utils/formula');

    const measurements = state.project.avatar.measurements as unknown as Record<string, number>;
    const extra = (params.extraVariables as Record<string, number>) || {};
    const variables = { ...measurements, ...extra };

    const result = evaluateFormula(params.formula as string, { variables });

    if (result.error) {
      return { success: false, error: result.error };
    }

    return { success: true, data: { value: result.value } };
  },
};

// ─── analyzeDXFImport ───────────────────────────────────────────────────────

const analyzeDXFImportTool: ToolDefinition = {
  name: 'analyzeDXFImport',
  description:
    'Analyze an imported DXF file: identify pieces, suggest names, detect pattern type. ' +
    '/ Analizar un archivo DXF importado: identificar piezas, sugerir nombres, detectar tipo de patrón.',
  parameters: {
    type: 'object',
    properties: {
      content: { type: 'string', description: 'DXF file content / Contenido del archivo DXF' },
    },
    required: ['content'],
  },
  execute: async (params): Promise<ToolResult> => {
    try {
      const { parseDXF } = await import('../../../../utils/dxf/parser');
      const { dxfToPatternPieces } = await import('../../../../utils/dxf/converter');

      const doc = parseDXF(params.content as string);
      const pieces = dxfToPatternPieces(doc);

      const pieceSummaries = pieces.map((p, idx) => {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const cmd of p.outline) {
          for (let i = 0; i < cmd.values.length - 1; i += 2) {
            minX = Math.min(minX, cmd.values[i]);
            minY = Math.min(minY, cmd.values[i + 1]);
            maxX = Math.max(maxX, cmd.values[i]);
            maxY = Math.max(maxY, cmd.values[i + 1]);
          }
        }
        return {
          suggestedName: p.name || `Piece ${idx + 1}`,
          area: computeArea(p.outline),
          bounds: {
            width: Math.round(maxX - minX),
            height: Math.round(maxY - minY),
          },
          hasNotches: p.internals.some(i => i.type === 'notch'),
          hasGrainline: p.internals.some(i => i.type === 'grainline'),
        };
      });

      return {
        success: true,
        data: {
          pieces: pieceSummaries,
          totalPieces: pieces.length,
        },
      };
    } catch (e: unknown) {
      return { success: false, error: (e as Error).message };
    }
  },
};

// ─── Export ─────────────────────────────────────────────────────────────────

export const tools: ToolDefinition[] = [
  measureDistanceTool,
  analyzePieceTool,
  analyzeProjectTool,
  evaluateFormulaTool,
  analyzeDXFImportTool,
];
