/**
 * Blueprint Tools — copilot tools for finding, executing, and managing construction blueprints.
 * 
 * A Blueprint contains Blocks (body, sleeve, collar, etc.), each with its own method and steps.
 * The LLM finds the right blueprint and executes all its blocks with the user's measurements.
 * 
 * @module blueprintTools
 */

import type { ToolDefinition, ToolResult } from '../registry';
import type { Blueprint, BlueprintStep } from '../../../types/blueprint';
import { executeBlueprint, validateBlueprint } from '../../../utils/construction/blueprintExecutor';
import { saveBlueprint, startBlueprint } from '../../../store/blueprintSlice';
import { clearConstruction, setConstructionPieceNormOffset } from '../../../store/constructionSlice';
import { addPiece } from '../../../store/projectSlice';
import { selectPiece } from '../../../store/editorSlice';
import { buildPieceWithOffset } from '../../../utils/construction/pieceBuilder';

// ─── searchBlueprints ───────────────────────────────────────────────────────

const searchBlueprintsTool: ToolDefinition = {
  name: 'searchBlueprints',
  description:
    'Search the blueprint library for garment construction plans. A blueprint contains all blocks (body, sleeve, etc.) needed for a complete garment. ' +
    'ALWAYS search before constructing — never invent construction steps. ' +
    '/ Buscar planos de construcción en la biblioteca.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query (e.g., "t-shirt", "blusa", "pantalón")' },
      category: {
        type: 'string',
        enum: ['tops', 'bottoms', 'dresses', 'outerwear', 'underwear', 'accessories', 'blocks', 'other'],
      },
    },
  },
  execute: async (params, _dispatch, getState): Promise<ToolResult> => {
    const state = getState();
    const blueprints = state.blueprints.blueprints;
    const query = ((params.query as string) || '').toLowerCase();

    let results = blueprints;

    if (query) {
      results = blueprints.filter((r: Blueprint) => {
        const methods = r.blocks.map(b => b.method).join(' ');
        const blockNames = r.blocks.map(b => [b.name, b.nameEs]).flat().join(' ');
        const searchText = [
          r.name, r.nameEs, r.description, r.descriptionEs,
          methods, blockNames, r.category, ...r.tags,
        ].filter(Boolean).join(' ').toLowerCase();
        return searchText.includes(query);
      });
    }

    if (params.category) {
      results = results.filter((r: Blueprint) => r.category === params.category);
    }

    if (results.length === 0) {
      return {
        success: true,
        data: {
          results: [],
          total: 0,
          hint: 'No blueprints found. The patronista can create a new blueprint, or you can use Seamly2D templates (searchTemplates).',
        },
      };
    }

    return {
      success: true,
      data: {
        results: results.map((r: Blueprint) => ({
          id: r.id,
          name: r.name,
          nameEs: r.nameEs,
          category: r.category,
          description: r.description,
          requiredMeasurements: r.requiredMeasurements,
          blocks: r.blocks.map(b => ({ id: b.id, name: b.name, method: b.method, type: b.type, steps: b.steps.length })),
          totalSteps: r.blocks.reduce((sum, b) => sum + b.steps.length, 0),
          source: r.source,
          tags: r.tags,
        })),
        total: results.length,
      },
    };
  },
};

// ─── executeBlueprint ───────────────────────────────────────────────────────

const executeBlueprintTool: ToolDefinition = {
  name: 'executeBlueprint',
  description:
    'Execute a blueprint to build a complete garment. Builds ALL blocks (body, sleeve, etc.) automatically. ' +
    'This is the primary way to create garments. ' +
    '/ Ejecutar un plano de construcción para crear una prenda completa.',
  parameters: {
    type: 'object',
    properties: {
      blueprintId: { type: 'string', description: 'Blueprint ID from searchBlueprints' },
      overrides: {
        type: 'object',
        description: 'Variable overrides (e.g., {"ease": 20, "sleeveLength": 600})',
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
    const blueprint = state.blueprints.blueprints.find((r: Blueprint) => r.id === params.blueprintId);

    if (!blueprint) {
      return { success: false, error: `Blueprint "${params.blueprintId}" not found. Use searchBlueprints to find available blueprints.` };
    }

    // Validate measurements — convert cm → mm (BodyMeasurements stores cm, blueprints use mm)
    const rawMeasurements = state.project.avatar.measurements as unknown as Record<string, number>;
    const measurements: Record<string, number> = {};
    for (const [k, v] of Object.entries(rawMeasurements)) {
      measurements[k] = typeof v === 'number' ? v * 10 : v;
    }
    console.log('[executeBlueprint] measurements (mm):', JSON.stringify(measurements));
    const validation = validateBlueprint(blueprint, measurements);
    console.log('[executeBlueprint] validation:', JSON.stringify(validation));

    if (validation.missing.length > 0) {
      return {
        success: false,
        error: `Missing measurements: ${validation.missing.join(', ')}. Set them with setMeasurements before executing.`,
      };
    }

    // Clear existing construction
    if (params.clearFirst !== false) {
      dispatch(clearConstruction());
    }

    // Execute all blocks
    const overrides = params.overrides as Record<string, number> | undefined;
    const actions = executeBlueprint(blueprint, measurements, overrides);

    dispatch(startBlueprint(blueprint.id));

    let dispatched = 0;
    const dispatchErrors: string[] = [];
    for (const stepAction of actions) {
      try {
        dispatch(stepAction.action);
        dispatched++;
      } catch (e) {
        dispatchErrors.push(`${stepAction.description}: ${(e as Error).message}`);
      }
    }
    console.log('[executeBlueprint] dispatched:', dispatched, 'errors:', dispatchErrors.length);
    if (dispatchErrors.length > 0) console.error('[executeBlueprint] dispatch errors:', dispatchErrors);

    // Build actual PatternPieces from construction pieces
    const updatedState = getState();
    const construction = updatedState.construction;
    const ctx = { measurements, variables: construction.variables as Record<string, number> };
    const builtPieces: { id: string; name: string; block: string }[] = [];
    const buildErrors: string[] = [];

    console.log('[executeBlueprint] construction state — points:', construction.points.length, 'curves:', construction.curves.length, 'pieces:', construction.pieces.length);
    if (construction.pieces.length === 0) {
      buildErrors.push(`No construction pieces found after dispatching ${dispatched} actions. Points: ${construction.points.length}, Curves: ${construction.curves.length}`);
    }

    let xOffset = 50;
    for (const cPiece of construction.pieces) {
      try {
        const { piece, normOffset } = buildPieceWithOffset(cPiece, construction.points, construction.curves, ctx);
        // Store normOffset on CPiece for overlay alignment
        dispatch(setConstructionPieceNormOffset({ pieceId: cPiece.id, normOffset }));
        // Position pieces side by side with 80mm gap
        const xs = piece.outline.flatMap(c => c.values.filter((_, i) => i % 2 === 0));
        const pieceWidth = xs.length > 0 ? Math.max(...xs) - Math.min(...xs) : 200;
        piece.position = { x: xOffset, y: 50 };
        xOffset += pieceWidth + 80;
        dispatch(addPiece(piece));
        builtPieces.push({ id: piece.id, name: piece.name, block: cPiece.name });
      } catch (e) {
        const nodeInfo = cPiece.nodes.map(n => {
          const pt = construction.points.find(p => p.id === n.pointId || p.label === n.pointId);
          return `${n.pointId}(${pt ? 'found' : 'MISSING'})`;
        }).join(', ');
        buildErrors.push(`${cPiece.name}: ${(e as Error).message} [nodes: ${nodeInfo}]`);
      }
    }

    if (builtPieces.length > 0) {
      dispatch(selectPiece(builtPieces[0].id));
    }

    return {
      success: builtPieces.length > 0,
      data: {
        blueprint: blueprint.name,
        blocksExecuted: blueprint.blocks.map(b => ({ id: b.id, name: b.name, method: b.method })),
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

// ─── saveUserBlueprint ──────────────────────────────────────────────────────

const saveUserBlueprintTool: ToolDefinition = {
  name: 'saveUserBlueprint',
  description:
    'Save the current construction as a reusable blueprint. Groups all construction into a single block. ' +
    '/ Guardar la construcción actual como un plano reutilizable.',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Blueprint name' },
      nameEs: { type: 'string', description: 'Name in Spanish' },
      description: { type: 'string', description: 'What this blueprint creates' },
      category: {
        type: 'string',
        enum: ['tops', 'bottoms', 'dresses', 'outerwear', 'underwear', 'accessories', 'blocks', 'other'],
      },
      method: { type: 'string', description: 'Method name (e.g., "Aldrich", "Custom")' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Search tags' },
    },
    required: ['name', 'description', 'category'],
  },
  execute: async (params, dispatch, getState): Promise<ToolResult> => {
    const state = getState();
    const { points, lines, curves, pieces, variables } = state.construction;

    if (points.length === 0) {
      return { success: false, error: 'No construction to save. Build something first.' };
    }

    // Convert construction state to steps
    const steps: BlueprintStep[] = [];

    for (const pt of points) {
      const step: BlueprintStep = {
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
          tool: 'addConstructionCurve', label: cv.label,
          from: cv.definition.from, to: cv.definition.to,
          angle1: cv.definition.angle1, angle2: cv.definition.angle2,
          length1: cv.definition.length1, length2: cv.definition.length2,
        });
      }
    }

    for (const pc of pieces) {
      steps.push({
        tool: 'buildPieceFromConstruction', name: pc.name,
        points: pc.nodes.map(n => {
          const pt = state.construction.points.find(p => p.id === n.pointId);
          return pt?.label ?? n.pointId;
        }),
        curves: pc.nodes.map(n => n.curveId ?
          (state.construction.curves.find(c => c.id === n.curveId)?.label ?? null) : null),
        seamAllowance: pc.seamAllowance,
      });
    }

    const now = Date.now();
    const methodName = (params.method as string) || 'Custom';
    const blueprint: Blueprint = {
      id: `user_${now.toString(36)}`,
      name: params.name as string,
      nameEs: params.nameEs as string | undefined,
      description: params.description as string,
      descriptionEs: undefined,
      category: (params.category as Blueprint['category']) || 'other',
      requiredMeasurements: ['chest', 'waist', 'height'],
      variables: Object.entries(variables).reduce((acc, [k, v]) => {
        acc[k] = { label: k, default: v };
        return acc;
      }, {} as NonNullable<Blueprint['variables']>),
      blocks: [{
        id: 'main',
        name: params.name as string,
        method: methodName,
        type: 'body',
        steps,
      }],
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
        blocks: 1,
        totalSteps: steps.length,
        source: 'user',
      },
    };
  },
};

// ─── listBlueprints ─────────────────────────────────────────────────────────

const listBlueprintsTool: ToolDefinition = {
  name: 'listBlueprints',
  description: 'List all available blueprints in the library. / Listar todos los planos de construcción.',
  parameters: { type: 'object', properties: {} },
  execute: async (_params, _dispatch, getState): Promise<ToolResult> => {
    const blueprints = getState().blueprints.blueprints;
    return {
      success: true,
      data: {
        blueprints: blueprints.map((r: Blueprint) => ({
          id: r.id,
          name: r.name,
          category: r.category,
          blocks: r.blocks.map(b => ({ name: b.name, method: b.method, type: b.type })),
          source: r.source,
          totalSteps: r.blocks.reduce((sum, b) => sum + b.steps.length, 0),
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
