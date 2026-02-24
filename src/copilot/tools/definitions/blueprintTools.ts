/**
 * Blueprint Tools — copilot tools for finding, executing, and managing construction blueprints.
 * 
 * The LLM does NOT invent construction steps. It finds the right blueprint
 * and executes it. The patronista can edit blueprints or create new ones.
 * 
 * @module blueprintTools
 */

import type { ToolDefinition, ToolResult } from '../registry';
import type { Blueprint } from '../../../types/blueprint';
import { executeBlueprint, validateBlueprint } from '../../../utils/construction/blueprintExecutor';
import { saveBlueprint, startBlueprint } from '../../../store/blueprintSlice';
import { clearConstruction } from '../../../store/constructionSlice';
import { addPiece } from '../../../store/projectSlice';
import { selectPiece } from '../../../store/editorSlice';
import { buildPiece } from '../../../utils/construction/pieceBuilder';

// ─── searchBlueprints ──────────────────────────────────────────────────────────

const searchBlueprintsTool: ToolDefinition = {
  name: 'searchBlueprints',
  description:
    'Search the blueprint library for construction blueprints. Returns matching blueprints with metadata. ' +
    'ALWAYS search before constructing a garment — never invent construction steps. ' +
    '/ Buscar recetas de construcción en la biblioteca. SIEMPRE buscar antes de construir.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query (e.g., "blusa", "t-shirt", "pantalón")' },
      category: {
        type: 'string',
        enum: ['tops', 'bottoms', 'dresses', 'outerwear', 'underwear', 'sleeves', 'collars', 'blocks', 'other'],
      },
    },
  },
  execute: async (params, _dispatch, getState): Promise<ToolResult> => {
    const state = getState();
    const blueprints = state.blueprints.blueprints;
    const query = ((params.query as string) || '').toLowerCase();

    let results = blueprints;

    if (query) {
      results = blueprints.filter(r => {
        const searchText = [
          r.name, r.nameEs, r.description, r.descriptionEs,
          r.method, r.category, ...r.tags,
        ].filter(Boolean).join(' ').toLowerCase();
        return searchText.includes(query);
      });
    }

    if (params.category) {
      results = results.filter(r => r.category === params.category);
    }

    if (results.length === 0) {
      return {
        success: true,
        data: {
          results: [],
          total: 0,
          hint: 'No blueprints found. The patronista can create a new blueprint, or you can use the Seamly2D templates (searchTemplates).',
        },
      };
    }

    return {
      success: true,
      data: {
        results: results.map(r => ({
          id: r.id,
          name: r.name,
          nameEs: r.nameEs,
          category: r.category,
          method: r.method,
          description: r.description,
          requiredMeasurements: r.requiredMeasurements,
          steps: r.steps.length,
          source: r.source,
          tags: r.tags,
        })),
        total: results.length,
      },
    };
  },
};

// ─── executeBlueprint ──────────────────────────────────────────────────────────

const executeBlueprintTool: ToolDefinition = {
  name: 'executeBlueprint',
  description:
    'Execute a construction blueprint to build a garment. Clears current construction and builds from the blueprint steps. ' +
    'Optionally override blueprint variables (e.g., ease, length). ' +
    '/ Ejecutar una receta de construcción para crear una prenda.',
  parameters: {
    type: 'object',
    properties: {
      blueprintId: { type: 'string', description: 'Blueprint ID from searchBlueprints' },
      overrides: {
        type: 'object',
        description: 'Variable overrides (e.g., {"ease": 20, "length": 600})',
      },
      clearFirst: {
        type: 'boolean',
        description: 'Clear existing construction before executing (default: true)',
      },
    },
    required: ['blueprintId'],
  },
  execute: async (params, dispatch, getState): Promise<ToolResult> => {
    const state = getState();
    const blueprint = state.blueprints.blueprints.find(r => r.id === params.blueprintId);

    if (!blueprint) {
      return { success: false, error: `Blueprint "${params.blueprintId}" not found. Use searchBlueprints to find available blueprints.` };
    }

    // Validate measurements
    const measurements = state.project.avatar.measurements as unknown as Record<string, number>;
    const validation = validateBlueprint(blueprint, measurements);

    if (validation.missing.length > 0) {
      return {
        success: false,
        error: `Missing measurements: ${validation.missing.join(', ')}. Set them with setMeasurements before executing.`,
      };
    }

    // Clear existing construction if requested
    if (params.clearFirst !== false) {
      dispatch(clearConstruction());
    }

    // Execute blueprint
    const overrides = params.overrides as Record<string, number> | undefined;
    const actions = executeBlueprint(blueprint, measurements, overrides);

    // Track blueprint execution
    dispatch(startBlueprint(blueprint.id));

    // Dispatch all actions
    let dispatched = 0;
    for (const stepAction of actions) {
      dispatch(stepAction.action);
      dispatched++;
    }

    // After all construction actions dispatched, build actual PatternPieces
    // from the construction pieces that were added
    const updatedState = getState();
    const construction = updatedState.construction;
    const ctx = { measurements, variables: construction.variables as Record<string, number> };
    const builtPieces: { id: string; name: string }[] = [];
    const buildErrors: string[] = [];

    for (const cPiece of construction.pieces) {
      try {
        const piece = buildPiece(cPiece, construction.points, construction.curves, ctx);
        dispatch(addPiece(piece));
        builtPieces.push({ id: piece.id, name: piece.name });
      } catch (e) {
        buildErrors.push(`${cPiece.name}: ${(e as Error).message}`);
      }
    }

    // Select first built piece
    if (builtPieces.length > 0) {
      dispatch(selectPiece(builtPieces[0].id));
    }

    return {
      success: builtPieces.length > 0,
      data: {
        blueprint: blueprint.name,
        method: blueprint.method,
        stepsExecuted: dispatched,
        variables: blueprint.variables ? Object.entries(blueprint.variables).map(([k, v]) => ({
          name: k,
          label: v.label,
          value: overrides?.[k] ?? v.default,
        })) : [],
        piecesBuilt: builtPieces,
        ...(buildErrors.length > 0 ? { buildErrors } : {}),
      },
      ...(buildErrors.length > 0 ? { error: `Some pieces failed to build: ${buildErrors.join('; ')}` } : {}),
    };
  },
};

// ─── saveUserBlueprint ─────────────────────────────────────────────────────────

const saveUserBlueprintTool: ToolDefinition = {
  name: 'saveUserBlueprint',
  description:
    'Save the current construction as a reusable blueprint. The patronista can then re-execute it with different measurements. ' +
    '/ Guardar la construcción actual como una receta reutilizable.',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Blueprint name' },
      nameEs: { type: 'string', description: 'Blueprint name in Spanish' },
      description: { type: 'string', description: 'What this blueprint creates' },
      category: {
        type: 'string',
        enum: ['tops', 'bottoms', 'dresses', 'outerwear', 'underwear', 'sleeves', 'collars', 'blocks', 'other'],
      },
      method: { type: 'string', description: 'Method name (e.g., "Aldrich", "Custom")' },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Search tags',
      },
    },
    required: ['name', 'description', 'category'],
  },
  execute: async (params, dispatch, getState): Promise<ToolResult> => {
    const state = getState();
    const { points, lines, curves, pieces, variables } = state.construction;

    if (points.length === 0) {
      return { success: false, error: 'No construction to save. Build something first.' };
    }

    // Convert current construction state back to blueprint steps
    const steps: Blueprint['steps'] = [];

    for (const pt of points) {
      const step: Blueprint['steps'][0] = {
        tool: 'addConstructionPoint',
        label: pt.label,
        type: pt.definition.type as 'absolute',
      };

      const def = pt.definition;
      if (def.type === 'absolute') { step.x = def.x; step.y = def.y; }
      else if (def.type === 'endLine') { step.basePoint = def.basePoint; step.angle = def.angle; step.length = def.length; }
      else if (def.type === 'alongLine') { step.from = def.from; step.to = def.to; step.length = def.length; }
      else if (def.type === 'normal') { step.from = def.from; step.to = def.to; step.angle = def.angle; step.length = def.length; }
      else if (def.type === 'midpoint') { step.from = def.from; step.to = def.to; }
      else if (def.type === 'intersectionXY') { step.xFrom = def.xFrom; step.yFrom = def.yFrom; }
      else if (def.type === 'manual') { step.type = 'absolute'; step.x = def.x; step.y = def.y; }

      steps.push(step);
    }

    for (const ln of lines) {
      steps.push({ tool: 'addConstructionLine', label: ln.label, from: ln.from, to: ln.to, style: ln.style });
    }

    for (const cv of curves) {
      if (cv.definition.type === 'spline') {
        steps.push({
          tool: 'addConstructionCurve',
          label: cv.label,
          from: cv.definition.from,
          to: cv.definition.to,
          angle1: cv.definition.angle1,
          angle2: cv.definition.angle2,
          length1: cv.definition.length1,
          length2: cv.definition.length2,
        });
      }
    }

    for (const pc of pieces) {
      steps.push({
        tool: 'buildPieceFromConstruction',
        name: pc.name,
        points: pc.nodes.map(n => {
          const pt = state.construction.points.find(p => p.id === n.pointId);
          return pt?.label ?? n.pointId;
        }),
        curves: pc.nodes.map(n => n.curveId ? 
          (state.construction.curves.find(c => c.id === n.curveId)?.label ?? null) : null
        ),
        seamAllowance: pc.seamAllowance,
      });
    }

    const now = Date.now();
    const blueprint: Blueprint = {
      id: `user_${now.toString(36)}`,
      name: params.name as string,
      nameEs: params.nameEs as string | undefined,
      description: params.description as string,
      category: (params.category as Blueprint['category']) || 'other',
      method: (params.method as string) || 'Custom',
      requiredMeasurements: ['chest', 'waist', 'height'], // TODO: detect from formulas
      variables: Object.entries(variables).reduce((acc, [k, v]) => {
        acc[k] = { label: k, default: v };
        return acc;
      }, {} as NonNullable<Blueprint['variables']>),
      steps,
      source: 'user',
      tags: (params.tags as string[]) || [],
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    dispatch(saveBlueprint(blueprint));

    return {
      success: true,
      data: {
        blueprintId: blueprint.id,
        name: blueprint.name,
        steps: steps.length,
        source: 'user',
      },
    };
  },
};

// ─── listBlueprints ────────────────────────────────────────────────────────────

const listBlueprintsTool: ToolDefinition = {
  name: 'listBlueprints',
  description: 'List all available blueprints in the library. / Listar todas las recetas disponibles.',
  parameters: { type: 'object', properties: {} },
  execute: async (_params, _dispatch, getState): Promise<ToolResult> => {
    const blueprints = getState().blueprints.blueprints;
    return {
      success: true,
      data: {
        blueprints: blueprints.map(r => ({
          id: r.id,
          name: r.name,
          category: r.category,
          method: r.method,
          source: r.source,
          steps: r.steps.length,
        })),
        total: blueprints.length,
      },
    };
  },
};

// ─── Export ──────────────────────────────────────────────────────────────────

export const tools: ToolDefinition[] = [
  searchBlueprintsTool,
  executeBlueprintTool,
  saveUserBlueprintTool,
  listBlueprintsTool,
];
