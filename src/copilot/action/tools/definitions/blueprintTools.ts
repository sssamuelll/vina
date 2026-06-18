/**
 * Blueprint Tools — user blueprint management (DORMANT, not registered).
 *
 * searchBlueprints and executeBlueprint removed — no AI-generated blueprints.
 * Real patterns come from the user's imported DXF (file entry is always a
 * user gesture).
 *
 * DORMANT (M2, #847): these tools are NOT registered in the live tool set
 * (removed from registry.ts ALL_TOOL_MODULES), so the agent cannot reach them.
 * They also do not persist — `saveBlueprint` writes only to in-memory Redux
 * (no IDB/localStorage), so saved blueprints do not survive a reload. Retained
 * as the source substrate for blueprint authoring (#53, post-M2), which will
 * re-register them and add an executor + durable persistence.
 */

import type { ToolDefinition, ToolResult } from '../registry';
import type { Blueprint, BlueprintStep } from '../../../../types/blueprint';
import { saveBlueprint } from '../../../../store/blueprintSlice';

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
        method: (params.method as string) || 'Custom',
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
  description: 'List user-saved blueprints. Real patterns come from the user importing their DXF. / Listar planos guardados por el usuario.',
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
          source: r.source,
        })),
        total: blueprints.length,
        hint: blueprints.length === 0
          ? 'No user blueprints saved. Real patterns come from the user importing their DXF.'
          : undefined,
      },
    };
  },
};

export const tools: ToolDefinition[] = [
  saveUserBlueprintTool,
  listBlueprintsTool,
];
