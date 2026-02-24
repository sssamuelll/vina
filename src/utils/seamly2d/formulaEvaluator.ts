/**
 * Seamly2D Formula Evaluator
 *
 * Evaluates formula strings like "bust_circ/10+12+5" or
 * "(#BustCircumfence < 112 ? #BustCircumfence/5-1 : 10)"
 * against a context of measurements and variables.
 *
 * Uses sanitized `new Function()` — only allows numbers, arithmetic,
 * comparisons, ternary, and variable references.
 */

export interface FormulaContext {
  measurements: Record<string, number>;
  variables: Record<string, number>;
}

/** Characters/tokens allowed in a sanitized formula (after variable substitution). */
const SAFE_FORMULA_RE = /^[\d\s+\-*/().?:<>=!&|,A-Za-z_\u00C0-\u024F\u0400-\u04FF\u0500-\u052F]+$/;

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
  expr = expr.replace(/\b(Line|AngleLine|CurrentLength|CurrentSeamAllowance|Spl|SplPath)_[A-Za-z0-9_]+/g, (match) => {
    if (context.variables[match] !== undefined) return String(context.variables[match]);
    if (context.variables[`#${match}`] !== undefined) return String(context.variables[`#${match}`]);
    return '0';
  });

  // Replace @MeasurementName references (Cyrillic/Unicode measurement names)
  expr = expr.replace(/@([\p{L}_][\p{L}\p{N}_]*)/gu, (_match, name) => {
    const val = context.measurements[name] ?? context.measurements[`@${name}`];
    if (val !== undefined) return String(val);
    // Try as variable
    const vval = context.variables[`@${name}`] ?? context.variables[name];
    if (vval !== undefined) return String(vval);
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

  // Replace Seamly2D-specific math functions (aliases)
  expr = expr.replace(/\brint\b/g, '__ROUND__');
  expr = expr.replace(/\bsign\b/g, '__SIGN__');

  // Replace math functions with Math.* equivalents
  expr = expr.replace(/\b(atan2|atan|asin|acos|sin|cos|tan|sqrt|abs|min|max|pow|floor|ceil|round)\b/g, 'Math.$1');

  // Now replace aliases (after main pass to avoid double-replacement)
  expr = expr.replace(/__ROUND__/g, 'Math.round');
  expr = expr.replace(/__SIGN__/g, 'Math.sign');

  // Validate the expression is safe
  if (!SAFE_FORMULA_RE.test(expr)) {
    throw new Error(`Unsafe formula expression: ${expr} (original: ${formula})`);
  }

  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(`"use strict"; return (${expr});`);
    const result = fn();
    if (typeof result !== 'number' || !isFinite(result)) {
      throw new Error(`Formula did not evaluate to a finite number: ${formula} → ${result}`);
    }
    return result;
  } catch (err) {
    throw new Error(`Failed to evaluate formula "${formula}" (resolved: "${expr}"): ${(err as Error).message}`);
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
    } catch {
      resolved[name] = 0; // graceful fallback
    }
  }

  return resolved;
}
