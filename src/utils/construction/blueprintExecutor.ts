/**
 * Blueprint Executor
 * 
 * Takes a Blueprint and body measurements, resolves all formula variables,
 * and returns the list of Redux actions to dispatch — across all blocks.
 * 
 * The executor does NOT dispatch directly — it returns actions so the
 * caller can dispatch them all at once or step-by-step.
 */

import type { Blueprint, Block, PointStep } from '../../types/blueprint';
import type { PointDefinition } from '../../types/construction';
import { evaluateFormula, type FormulaContext } from '../seamly2d/formulaEvaluator';
import {
  addPoint, addLine, addCurve,
  addConstructionPiece, setVariable,
} from '../../store/constructionSlice';

// ─── Formula resolution ─────────────────────────────────────────────────────

function resolveFormula(val: string | number | undefined, ctx: FormulaContext): number {
  if (val === undefined) return 0;
  if (typeof val === 'number') return val;
  try {
    return evaluateFormula(val, ctx);
  } catch {
    return 0;
  }
}

// ─── Build FormulaContext from measurements + variables ──────────────────────

function buildContext(
  measurements: Record<string, number>,
  blueprintVars: Blueprint['variables'],
  blockVars: Block['variables'],
  userOverrides?: Record<string, number>,
): FormulaContext {
  const variables: Record<string, number> = {};
  const baseCtx: FormulaContext = { measurements, variables: {} };

  // Blueprint-level variables first
  if (blueprintVars) {
    for (const [name, def] of Object.entries(blueprintVars)) {
      const override = userOverrides?.[name];
      if (override !== undefined) {
        variables[name] = override;
      } else {
        variables[name] = typeof def.default === 'number'
          ? def.default
          : evaluateFormula(def.default, baseCtx);
      }
    }
  }

  // Block-level variables (can reference blueprint variables)
  const blockCtx: FormulaContext = { measurements, variables: { ...variables } };
  if (blockVars) {
    for (const [name, def] of Object.entries(blockVars)) {
      const override = userOverrides?.[name];
      if (override !== undefined) {
        variables[name] = override;
      } else {
        variables[name] = typeof def.default === 'number'
          ? def.default
          : evaluateFormula(def.default, blockCtx);
      }
    }
  }

  return { measurements, variables };
}

// ─── Execute a single step ──────────────────────────────────────────────────

export interface StepAction {
  action: ReturnType<typeof addPoint> | ReturnType<typeof addLine> | ReturnType<typeof addCurve> |
          ReturnType<typeof addConstructionPiece> | ReturnType<typeof setVariable>;
  description: string;
  descriptionEs?: string;
  blockId: string;
  blockName: string;
}

function executePointStep(step: PointStep, ctx: FormulaContext): Omit<StepAction, 'blockId' | 'blockName'> {
  let definition: PointDefinition;

  switch (step.type) {
    case 'absolute':
      definition = {
        type: 'absolute',
        x: resolveFormula(step.x, ctx),
        y: resolveFormula(step.y, ctx),
      };
      break;
    case 'endLine':
      definition = {
        type: 'endLine',
        basePoint: step.basePoint!,
        angle: resolveFormula(step.angle, ctx),
        length: resolveFormula(step.length, ctx),
      };
      break;
    case 'alongLine':
      definition = {
        type: 'alongLine',
        from: step.from!,
        to: step.to!,
        length: resolveFormula(step.length, ctx),
      };
      break;
    case 'normal':
      definition = {
        type: 'normal',
        from: step.from!,
        to: step.to!,
        angle: resolveFormula(step.angle, ctx),
        length: resolveFormula(step.length, ctx),
      };
      break;
    case 'midpoint':
      definition = { type: 'midpoint', from: step.from!, to: step.to! };
      break;
    case 'intersectionXY':
      definition = { type: 'intersectionXY', xFrom: step.xFrom!, yFrom: step.yFrom! };
      break;
    default:
      definition = { type: 'manual', x: 0, y: 0 };
  }

  return {
    action: addPoint({ label: step.label, definition }),
    description: step.comment || `Point "${step.label}" (${step.type})`,
    descriptionEs: step.commentEs,
  };
}

// ─── Execute all blocks in a blueprint ──────────────────────────────────────

export function executeBlueprint(
  blueprint: Blueprint,
  measurements: Record<string, number>,
  userOverrides?: Record<string, number>,
): StepAction[] {
  const actions: StepAction[] = [];

  for (const block of blueprint.blocks) {
    const ctx = buildContext(measurements, blueprint.variables, block.variables, userOverrides);

    // Set variables for this block
    const allVars = { ...ctx.variables };
    for (const [name, val] of Object.entries(allVars)) {
      actions.push({
        action: setVariable({ name, value: val }),
        description: `Variable "${name}" = ${val}`,
        blockId: block.id,
        blockName: block.name,
      });
    }

    for (const step of block.steps) {
      const base = { blockId: block.id, blockName: block.name };

      switch (step.tool) {
        case 'addConstructionPoint':
          actions.push({ ...executePointStep(step, ctx), ...base });
          break;

        case 'addConstructionLine':
          actions.push({
            action: addLine({ label: step.label, from: step.from, to: step.to, style: step.style }),
            description: step.comment || `Line "${step.label}" (${step.from} → ${step.to})`,
            descriptionEs: step.commentEs,
            ...base,
          });
          break;

        case 'addConstructionCurve':
          actions.push({
            action: addCurve({
              label: step.label,
              definition: {
                type: 'spline',
                from: step.from,
                to: step.to,
                angle1: resolveFormula(step.angle1, ctx),
                angle2: resolveFormula(step.angle2, ctx),
                length1: resolveFormula(step.length1, ctx),
                length2: resolveFormula(step.length2, ctx),
              },
            }),
            description: step.comment || `Curve "${step.label}" (${step.from} → ${step.to})`,
            descriptionEs: step.commentEs,
            ...base,
          });
          break;

        case 'buildPieceFromConstruction':
          actions.push({
            action: addConstructionPiece({
              name: step.name,
              nodes: step.points.map((label, i) => ({
                pointId: label,
                connection: (step.curves?.[i] && step.curves[i] !== null) ? 'curve' as const : 'line' as const,
                curveId: step.curves?.[i] ?? undefined,
              })),
              seamAllowance: step.seamAllowance ?? 10,
            }),
            description: step.comment || `Build piece "${step.name}" from ${step.points.length} points`,
            descriptionEs: step.commentEs,
            ...base,
          });
          break;
      }
    }
  }

  return actions;
}

// ─── Validate blueprint against available measurements ──────────────────────

export interface ValidationResult {
  valid: boolean;
  missing: string[];
  warnings: string[];
}

export function validateBlueprint(blueprint: Blueprint, measurements: Record<string, number>): ValidationResult {
  const missing = blueprint.requiredMeasurements.filter(m => {
    const val = measurements[m];
    return val === undefined || val === 0;
  });

  const warnings: string[] = [];
  if (blueprint.blocks.length === 0) warnings.push('Blueprint has no blocks');
  const hasBuilds = blueprint.blocks.some(b =>
    b.steps.some(s => s.tool === 'buildPieceFromConstruction')
  );
  if (!hasBuilds) warnings.push('Blueprint has no buildPieceFromConstruction steps');

  return { valid: missing.length === 0 && warnings.length === 0, missing, warnings };
}
