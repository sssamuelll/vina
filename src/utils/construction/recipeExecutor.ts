/**
 * Recipe Executor
 * 
 * Takes a Recipe and body measurements, resolves all formula variables,
 * and returns the list of Redux actions to dispatch.
 * 
 * The executor does NOT dispatch directly — it returns actions so the
 * caller (copilot tool or UI) can dispatch them one by one (for step-by-step)
 * or all at once (for instant execution).
 */

import type { Recipe, PointStep } from '../../types/recipe';
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

// ─── Build FormulaContext from measurements + recipe variables ───────────────

function buildContext(
  measurements: Record<string, number>,
  recipeVars: Recipe['variables'],
  userOverrides?: Record<string, number>,
): FormulaContext {
  const variables: Record<string, number> = {};

  // First resolve recipe variable defaults
  if (recipeVars) {
    const baseCtx: FormulaContext = { measurements, variables: {} };
    for (const [name, def] of Object.entries(recipeVars)) {
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

  return { measurements, variables };
}

// ─── Execute a single step ──────────────────────────────────────────────────

export interface StepAction {
  /** Redux action to dispatch */
  action: ReturnType<typeof addPoint> | ReturnType<typeof addLine> | ReturnType<typeof addCurve> |
          ReturnType<typeof addConstructionPiece> | ReturnType<typeof setVariable>;
  /** Human-readable description of what this step does */
  description: string;
  descriptionEs?: string;
}

function executePointStep(step: PointStep, ctx: FormulaContext): StepAction {
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

export function executeRecipe(
  recipe: Recipe,
  measurements: Record<string, number>,
  userOverrides?: Record<string, number>,
): StepAction[] {
  const ctx = buildContext(measurements, recipe.variables, userOverrides);
  const actions: StepAction[] = [];

  // Set recipe variables in construction state
  for (const [name, val] of Object.entries(ctx.variables)) {
    actions.push({
      action: setVariable({ name, value: val }),
      description: `Variable "${name}" = ${val}`,
    });
  }

  for (const step of recipe.steps) {
    switch (step.tool) {
      case 'addConstructionPoint':
        actions.push(executePointStep(step, ctx));
        break;

      case 'addConstructionLine':
        actions.push({
          action: addLine({
            label: step.label,
            from: step.from,
            to: step.to,
            style: step.style,
          }),
          description: step.comment || `Line "${step.label}" (${step.from} → ${step.to})`,
          descriptionEs: step.commentEs,
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
        });
        break;

      case 'buildPieceFromConstruction':
        // This step is special — we store the piece definition but the actual
        // PatternPiece building happens after all points are dispatched.
        // We use addConstructionPiece here.
        actions.push({
          action: addConstructionPiece({
            name: step.name,
            nodes: step.points.map((label, i) => ({
              pointId: label, // Will be resolved by label in the builder
              connection: (step.curves?.[i] && step.curves[i] !== null) ? 'curve' as const : 'line' as const,
              curveId: step.curves?.[i] ?? undefined,
            })),
            seamAllowance: step.seamAllowance ?? 10,
          }),
          description: step.comment || `Build piece "${step.name}" from ${step.points.length} points`,
          descriptionEs: step.commentEs,
        });
        break;
    }
  }

  return actions;
}

// ─── Validate recipe against available measurements ─────────────────────────

export interface ValidationResult {
  valid: boolean;
  missing: string[];
  warnings: string[];
}

export function validateRecipe(recipe: Recipe, measurements: Record<string, number>): ValidationResult {
  const missing = recipe.requiredMeasurements.filter(m => {
    const val = measurements[m];
    return val === undefined || val === 0;
  });

  const warnings: string[] = [];
  if (recipe.steps.length === 0) warnings.push('Recipe has no steps');
  const buildSteps = recipe.steps.filter(s => s.tool === 'buildPieceFromConstruction');
  if (buildSteps.length === 0) warnings.push('Recipe has no buildPieceFromConstruction step');

  return {
    valid: missing.length === 0 && warnings.length === 0,
    missing,
    warnings,
  };
}
