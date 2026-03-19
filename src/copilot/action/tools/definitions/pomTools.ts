/**
 * POM (Points of Measure) Tools — create, read, update, and remove
 * named measurements between pattern piece reference points.
 * Herramientas POM (Puntos de Medida) — crear, leer, actualizar y eliminar
 * medidas nombradas entre puntos de referencia de piezas de patrón.
 *
 * @module pomTools
 */

import type { ToolDefinition, ToolResult } from '../registry';
import type { AppDispatch, RootState } from '../../../../store';
import type { PointOfMeasure, POMCategory, POMMethod, POMPoint, Point2D } from '../../../../types/types';
import { addPOM, updatePOM, removePOM } from '../../../../store/projectSlice';
import { computePOMValue, recomputeAllPOMs } from '../../../../utils/pom/pomCompute';
import { uid } from '../../../../utils/pathHelpers';

// ─── createPOM ──────────────────────────────────────────────────────────────

const createPOMTool: ToolDefinition = {
  name: 'createPOM',
  description:
    'Create a named Point of Measure between two reference points on pattern pieces. ' +
    'Supports straight distance, along-edge, circumference, height, and surface tape methods. ' +
    '/ Crear un Punto de Medida nombrado entre dos puntos de referencia en piezas de patrón. ' +
    'Soporta distancia recta, a lo largo del borde, circunferencia, altura y cinta de superficie.',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Human-readable measurement name / Nombre legible de la medida' },
      category: {
        type: 'string',
        enum: ['length', 'width', 'circumference', 'height', 'custom'],
        description: 'Measurement category for grouping / Categoría de medida para agrupación',
      },
      method: {
        type: 'string',
        enum: ['straight', 'alongEdge', 'circumference', 'height', 'surfaceTape'],
        description: 'Measurement method / Método de medición. Default: straight',
      },
      pieceAId: { type: 'string', description: 'ID of the first piece / ID de la primera pieza' },
      edgeAName: { type: 'string', description: 'Optional semantic edge name on piece A — resolves midpoint as localPosition / Nombre de borde semántico opcional en pieza A' },
      positionA: {
        type: 'object',
        properties: {
          x: { type: 'number' },
          y: { type: 'number' },
        },
        description: 'Optional explicit local position on piece A / Posición local explícita en pieza A',
      },
      pieceBId: { type: 'string', description: 'ID of the second piece (defaults to pieceAId) / ID de la segunda pieza' },
      edgeBName: { type: 'string', description: 'Optional semantic edge name on piece B / Nombre de borde semántico en pieza B' },
      positionB: {
        type: 'object',
        properties: {
          x: { type: 'number' },
          y: { type: 'number' },
        },
        description: 'Optional explicit local position on piece B / Posición local explícita en pieza B',
      },
      tolerance: { type: 'number', description: 'Acceptable tolerance in mm / Tolerancia aceptable en mm' },
    },
    required: ['name', 'pieceAId'],
  },
  execute: async (
    params: Record<string, unknown>,
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<ToolResult> => {
    const state = getState();
    const pieces = state.project.pieces;

    // Validate piece A
    const pieceA = pieces.find(p => p.id === params.pieceAId);
    if (!pieceA) return { success: false, error: `Piece "${params.pieceAId}" not found` };

    // Validate piece B (defaults to piece A)
    const pieceBId = (params.pieceBId as string) || (params.pieceAId as string);
    const pieceB = pieces.find(p => p.id === pieceBId);
    if (!pieceB) return { success: false, error: `Piece "${pieceBId}" not found` };

    const method: POMMethod = (params.method as POMMethod) || 'straight';
    const category: POMCategory = (params.category as POMCategory) || 'custom';

    // ─── Resolve point A ───────────────────────────────────────────────
    let pointA: POMPoint;
    if (params.edgeAName) {
      const edge = pieceA.edges?.find(e => e.name === params.edgeAName);
      if (!edge) return { success: false, error: `Edge "${params.edgeAName}" not found on piece "${pieceA.name}"` };
      // Resolve edge midpoint
      const [start, end] = edge.segmentRange;
      const midIdx = Math.floor((start + end) / 2);
      const cmd = pieceA.outline[midIdx];
      const lx = cmd && cmd.values.length >= 2 ? cmd.values[cmd.values.length - 2] : 0;
      const ly = cmd && cmd.values.length >= 2 ? cmd.values[cmd.values.length - 1] : 0;
      pointA = {
        pieceId: params.pieceAId as string,
        edgeName: params.edgeAName as string,
        t: method === 'alongEdge' ? 0 : 0.5,
        localPosition: { x: lx, y: ly },
      };
    } else if (params.positionA) {
      const pos = params.positionA as Point2D;
      pointA = {
        pieceId: params.pieceAId as string,
        localPosition: { x: pos.x, y: pos.y },
      };
    } else {
      // Default: origin of piece
      pointA = {
        pieceId: params.pieceAId as string,
        localPosition: { x: 0, y: 0 },
      };
    }

    // ─── Resolve point B ───────────────────────────────────────────────
    let pointB: POMPoint;
    if (method === 'alongEdge' && params.edgeAName) {
      // Along-edge: both points reference same piece/edge, t=0 and t=1
      pointB = {
        pieceId: params.pieceAId as string,
        edgeName: params.edgeAName as string,
        t: 1,
        localPosition: pointA.localPosition,
      };
    } else if (params.edgeBName) {
      const edge = pieceB.edges?.find(e => e.name === params.edgeBName);
      if (!edge) return { success: false, error: `Edge "${params.edgeBName}" not found on piece "${pieceB.name}"` };
      const [start, end] = edge.segmentRange;
      const midIdx = Math.floor((start + end) / 2);
      const cmd = pieceB.outline[midIdx];
      const lx = cmd && cmd.values.length >= 2 ? cmd.values[cmd.values.length - 2] : 0;
      const ly = cmd && cmd.values.length >= 2 ? cmd.values[cmd.values.length - 1] : 0;
      pointB = {
        pieceId: pieceBId,
        edgeName: params.edgeBName as string,
        t: 0.5,
        localPosition: { x: lx, y: ly },
      };
    } else if (params.positionB) {
      const pos = params.positionB as Point2D;
      pointB = {
        pieceId: pieceBId,
        localPosition: { x: pos.x, y: pos.y },
      };
    } else {
      pointB = {
        pieceId: pieceBId,
        localPosition: { x: 0, y: 0 },
      };
    }

    // ─── Build POM and compute ─────────────────────────────────────────
    const now = Date.now();
    const pomId = uid();
    const pom: PointOfMeasure = {
      id: pomId,
      name: params.name as string,
      category,
      method,
      pointA,
      pointB,
      value: 0,
      tolerance: params.tolerance as number | undefined,
      createdAt: now,
      updatedAt: now,
    };

    const computed = computePOMValue(pom, pieces);
    if (computed == null) {
      return { success: false, error: 'Could not compute POM value — check piece/edge references' };
    }
    pom.value = computed;

    dispatch(addPOM(pom));

    return {
      success: true,
      data: {
        pomId: pom.id,
        name: pom.name,
        category: pom.category,
        method: pom.method,
        value: pom.value,
        tolerance: pom.tolerance,
      },
      rollback: () => {
        dispatch(removePOM(pom.id));
      },
    };
  },
};

// ─── getPOMs ────────────────────────────────────────────────────────────────

const getPOMsTool: ToolDefinition = {
  name: 'getPOMs',
  description:
    'Read-only. Returns all points of measure, optionally filtered by category or piece ID. ' +
    'Recomputes values on-demand for freshness. ' +
    '/ Solo lectura. Devuelve todos los puntos de medida, opcionalmente filtrados por categoría o pieza. ' +
    'Recalcula valores bajo demanda.',
  parameters: {
    type: 'object',
    properties: {
      category: {
        type: 'string',
        enum: ['length', 'width', 'circumference', 'height', 'custom'],
        description: 'Filter by measurement category / Filtrar por categoría de medida',
      },
      pieceId: {
        type: 'string',
        description: 'Filter by piece ID (matches either pointA or pointB) / Filtrar por ID de pieza',
      },
    },
    required: [],
  },
  execute: async (
    params: Record<string, unknown>,
    _dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<ToolResult> => {
    const state = getState();
    let poms = state.project.poms ?? [];
    const pieces = state.project.pieces;

    // Filter by category
    if (params.category) {
      poms = poms.filter(p => p.category === params.category);
    }

    // Filter by pieceId
    if (params.pieceId) {
      poms = poms.filter(
        p => p.pointA.pieceId === params.pieceId || p.pointB.pieceId === params.pieceId,
      );
    }

    // Recompute fresh values
    const updates = recomputeAllPOMs(poms, pieces);
    const updateMap = new Map(updates.map(u => [u.id, u.value]));

    const result = poms.map(p => {
      const pieceA = pieces.find(pc => pc.id === p.pointA.pieceId);
      const pieceB = pieces.find(pc => pc.id === p.pointB.pieceId);
      return {
        id: p.id,
        name: p.name,
        category: p.category,
        method: p.method,
        value: updateMap.get(p.id) ?? p.value,
        tolerance: p.tolerance,
        pieceAName: pieceA?.name ?? 'Unknown',
        pieceBName: pieceB?.name ?? 'Unknown',
      };
    });

    return {
      success: true,
      data: { poms: result as unknown as Record<string, unknown>, count: result.length },
    };
  },
};

// ─── updatePOM ──────────────────────────────────────────────────────────────

const updatePOMTool: ToolDefinition = {
  name: 'updatePOM',
  description:
    'Update metadata of an existing Point of Measure (name, tolerance, category). ' +
    '/ Actualizar metadatos de un Punto de Medida existente (nombre, tolerancia, categoría).',
  parameters: {
    type: 'object',
    properties: {
      pomId: { type: 'string', description: 'ID of the POM to update / ID del POM a actualizar' },
      name: { type: 'string', description: 'New measurement name / Nuevo nombre de medida' },
      tolerance: { type: 'number', description: 'New tolerance in mm / Nueva tolerancia en mm' },
      category: {
        type: 'string',
        enum: ['length', 'width', 'circumference', 'height', 'custom'],
        description: 'New category / Nueva categoría',
      },
    },
    required: ['pomId'],
  },
  execute: async (
    params: Record<string, unknown>,
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<ToolResult> => {
    const state = getState();
    const pom = (state.project.poms ?? []).find(p => p.id === params.pomId);
    if (!pom) return { success: false, error: `POM "${params.pomId}" not found` };

    // Save previous state for rollback
    const previousPOM = { ...pom };

    const updated: PointOfMeasure = {
      ...pom,
      name: (params.name as string) ?? pom.name,
      category: (params.category as POMCategory) ?? pom.category,
      tolerance: params.tolerance !== undefined ? (params.tolerance as number) : pom.tolerance,
      updatedAt: Date.now(),
    };

    dispatch(updatePOM(updated));

    return {
      success: true,
      data: {
        pomId: updated.id,
        name: updated.name,
        category: updated.category,
        tolerance: updated.tolerance,
      },
      rollback: () => {
        dispatch(updatePOM(previousPOM));
      },
    };
  },
};

// ─── removePOM ──────────────────────────────────────────────────────────────

const removePOMTool: ToolDefinition = {
  name: 'removePOM',
  description:
    'Remove a Point of Measure by ID. ' +
    '/ Eliminar un Punto de Medida por su ID.',
  parameters: {
    type: 'object',
    properties: {
      pomId: { type: 'string', description: 'ID of the POM to remove / ID del POM a eliminar' },
    },
    required: ['pomId'],
  },
  execute: async (
    params: Record<string, unknown>,
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<ToolResult> => {
    const state = getState();
    const pom = (state.project.poms ?? []).find(p => p.id === params.pomId);
    if (!pom) return { success: false, error: `POM "${params.pomId}" not found` };

    // Save copy for rollback
    const savedPOM = { ...pom };

    dispatch(removePOM(pom.id));

    return {
      success: true,
      data: { pomId: pom.id, name: pom.name },
      rollback: () => {
        dispatch(addPOM(savedPOM));
      },
    };
  },
};

// ─── Export ──────────────────────────────────────────────────────────────────

export const tools: ToolDefinition[] = [
  createPOMTool,
  getPOMsTool,
  updatePOMTool,
  removePOMTool,
];
