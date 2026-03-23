/**
 * Seamly2D Formula Evaluator
 *
 * Evaluates formula strings like "bust_circ/10+12+5" or
 * "(#BustCircumfence < 112 ? #BustCircumfence/5-1 : 10)"
 * against a context of measurements and variables.
 *
 * Uses safeEval — a recursive-descent parser with no dynamic code construction.
 */

import { safeEval } from '../formula/safeEval';

export interface FormulaContext {
  measurements: Record<string, number>;
  variables: Record<string, number>;
}

/**
 * Evaluate a single Seamly2D formula string given a context.
 * Variables (#Name) and measurements (snake_case) are resolved from context.
 */
export function evaluateFormula(
  formula: string,
  context: FormulaContext,
): number {
  if (formula == null || formula === '') return 0;

  // If it's just a plain number, fast path
  const asNum = Number(formula);
  if (!isNaN(asNum)) return asNum;

  let expr = formula.trim();

  // Replace function-style references like Line_A_B, AngleLine_A_B, Spl_A_B, SplPath_A_B etc.
  // These may be unresolved during construction if the referenced geometry hasn't been computed yet.
  // Fall back to 0 (not throw) so the formula can still evaluate — the construction resolver
  // populates these incrementally as it processes steps in order.
  expr = expr.replace(/\b(Line|AngleLine|CurrentLength|CurrentSeamAllowance|Spl|SplPath)_[A-Za-z0-9_]+/g, (match) => {
    if (context.variables[match] !== undefined) return String(context.variables[match]);
    if (context.variables[`#${match}`] !== undefined) return String(context.variables[`#${match}`]);
    console.warn(`[formulaEvaluator] Unresolved reference: ${match}, defaulting to 0`);
    return '0';
  });

  // Replace @MeasurementName references (Cyrillic/Unicode measurement names)
  // Fall back to 0 if the measurement is not in context — it may be an optional measurement.
  expr = expr.replace(/@([\p{L}_][\p{L}\p{N}_]*)/gu, (_match, name) => {
    const val = context.measurements[name] ?? context.measurements[`@${name}`];
    if (val !== undefined) return String(val);
    // Try as variable
    const vval = context.variables[`@${name}`] ?? context.variables[name];
    if (vval !== undefined) return String(vval);
    console.warn(`[formulaEvaluator] Unresolved measurement: @${name}, defaulting to 0`);
    return '0';
  });

  // Replace #VariableName references with their numeric values (Unicode-aware)
  expr = expr.replace(/#([\p{L}_][\p{L}\p{N}_]*)/gu, (_match, name) => {
    const val = context.variables[`#${name}`] ?? context.variables[name];
    if (val === undefined) {
      throw new Error(`Unknown variable: #${name}`);
    }
    return String(val);
  });

  // Replace measurement names (snake_case identifiers) with their values
  // Process longer names first to avoid partial matches
  const measurementNames = Object.keys(context.measurements).sort((a, b) => b.length - a.length);
  for (const name of measurementNames) {
    // Replace whole-word occurrences
    const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
    expr = expr.replace(re, String(context.measurements[name]));
  }

  // Replace plain variable names (camelCase, no # prefix) — process longer first
  const varNames = Object.keys(context.variables).filter(n => !n.startsWith('#')).sort((a, b) => b.length - a.length);
  for (const name of varNames) {
    const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
    expr = expr.replace(re, String(context.variables[name]));
  }

  // Handle European locale: semicolons as function argument separators
  // Replace ; with , inside parentheses (function calls)
  expr = expr.replace(/;/g, ',');

  // Replace Seamly2D-specific math function aliases
  expr = expr.replace(/\brint\b/g, 'round');
  // 'sign' maps directly — safeEval recognizes it
  // Math function names (sin, cos, sqrt, etc.) pass through as-is — safeEval resolves them

  try {
    const result = safeEval(expr);
    if (typeof result !== 'number' || !isFinite(result)) {
      throw new Error(`Formula did not evaluate to a finite number: ${formula} → ${result}`);
    }
    return result;
  } catch (err) {
    throw new Error(`Failed to evaluate formula "${formula}" (resolved: "${expr}"): ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Variable definition from a Seamly2D pattern JSON.
 */
export interface VariableDefinition {
  formula: string;
  description?: string;
}

/**
 * Resolve all variables from a Seamly2D pattern, evaluating them in dependency order.
 * Variables can reference other variables and measurements.
 */
export function resolveVariables(
  variables: Record<string, VariableDefinition>,
  measurements: Record<string, number>,
): Record<string, number> {
  const resolved: Record<string, number> = {};
  const varNames = Object.keys(variables);

  // Build dependency graph
  const deps = new Map<string, string[]>();
  for (const name of varNames) {
    const formula = variables[name].formula;
    const varDeps: string[] = [];
    // Find #Variable references (Unicode-aware)
    const varRefRe = /#([\p{L}_][\p{L}\p{N}_]*)/gu;
    let m: RegExpExecArray | null;
    while ((m = varRefRe.exec(formula)) !== null) {
      const depName = `#${m[1]}`;
      if (depName !== name && varNames.includes(depName)) {
        varDeps.push(depName);
      }
    }
    deps.set(name, varDeps);
  }

  // Topological sort with cycle detection
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const order: string[] = [];

  function visit(name: string): void {
    if (visited.has(name)) return;
    if (visiting.has(name)) {
      // Cycle — evaluate to 0
      resolved[name] = 0;
      visited.add(name);
      return;
    }
    visiting.add(name);
    for (const dep of deps.get(name) ?? []) {
      visit(dep);
    }
    visiting.delete(name);
    visited.add(name);
    order.push(name);
  }

  for (const name of varNames) {
    visit(name);
  }

  // Evaluate in dependency order
  const context: FormulaContext = { measurements, variables: resolved };
  for (const name of order) {
    if (resolved[name] !== undefined) continue; // already set (cycle)
    try {
      resolved[name] = evaluateFormula(variables[name].formula, context);
    } catch (err) {
      console.warn(`[formulaEvaluator] Failed to resolve variable "${name}": ${err instanceof Error ? err.message : String(err)}. Defaulting to 0.`);
      resolved[name] = 0;
    }
  }

  return resolved;
}
