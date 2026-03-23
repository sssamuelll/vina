import type { FormulaContext, FormulaResult } from './types';
import { safeEval } from './safeEval';

const ALLOWED_FUNCTIONS = ['min', 'max', 'abs', 'round', 'floor', 'ceil', 'sqrt'];
const CONSTANTS: Record<string, number> = { PI: Math.PI };

function tokenize(formula: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < formula.length) {
    if (/\s/.test(formula[i])) { i++; continue; }
    if (/[0-9.]/.test(formula[i])) {
      let num = '';
      while (i < formula.length && /[0-9.]/.test(formula[i])) { num += formula[i]; i++; }
      tokens.push(num);
    } else if (/[a-zA-Z_]/.test(formula[i])) {
      let id = '';
      while (i < formula.length && /[a-zA-Z0-9_]/.test(formula[i])) { id += formula[i]; i++; }
      tokens.push(id);
    } else if ('+-*/%(),'.includes(formula[i])) {
      tokens.push(formula[i]); i++;
    } else {
      tokens.push(formula[i]); i++;
    }
  }
  return tokens;
}

/**
 * Extract all variable names referenced in a formula string.
 *
 * Tokenizes the formula and returns identifiers that are not built-in
 * functions (`min`, `max`, `abs`, etc.) or constants (`PI`).
 *
 * @param formula - The formula expression to analyze
 * @returns Array of unique variable names in order of first appearance
 *
 * @example
 * ```ts
 * getFormulaVariables('chest / 4 + ease'); // ['chest', 'ease']
 * ```
 */
export function getFormulaVariables(formula: string): string[] {
  const tokens = tokenize(formula);
  const vars: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (/^[a-zA-Z_]/.test(t) && !ALLOWED_FUNCTIONS.includes(t) && !(t in CONSTANTS)) {
      if (!vars.includes(t)) vars.push(t);
    }
  }
  return vars;
}

/**
 * Validate a formula against a given context without using the result.
 *
 * Delegates to {@link evaluateFormula} and converts the outcome to a
 * simple valid/error object.
 *
 * @param formula - The formula expression to validate
 * @param context - Context providing variable values for evaluation
 * @returns Object with `valid: true` on success, or `valid: false` and an `error` message
 */
export function validateFormula(
  formula: string,
  context: FormulaContext,
): { valid: boolean; error?: string } {
  const result = evaluateFormula(formula, context);
  if (result.error) return { valid: false, error: result.error };
  return { valid: true };
}

/**
 * Evaluate a mathematical formula string with variable substitution.
 *
 * Supports arithmetic operators (`+`, `-`, `*`, `/`, `%`), parentheses,
 * built-in functions (`min`, `max`, `abs`, `round`, `floor`, `ceil`, `sqrt`),
 * and the constant `PI`. Variables are resolved from `context.variables`.
 *
 * @remarks
 * The formula is tokenized, variables are substituted, and the resulting
 * expression is evaluated using a recursive descent parser (`safeEval`)
 * with no dynamic code construction.
 *
 * @param formula - The formula expression (e.g. `"chest / 4 + 2"`)
 * @param context - Context providing variable name → numeric value mappings
 * @returns A {@link FormulaResult} with the computed `value`, or `NaN` and an `error` string
 *
 * @example
 * ```ts
 * evaluateFormula('chest / 4 + ease', { variables: { chest: 88, ease: 2 } });
 * // { value: 24 }
 * ```
 */
export function evaluateFormula(formula: string, context: FormulaContext): FormulaResult {
  try {
    if (!formula || !formula.trim()) {
      return { value: NaN, error: 'Empty formula' };
    }

    const tokens = tokenize(formula);
    // Build expression by replacing identifiers
    const exprParts: string[] = [];
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (/^[a-zA-Z_]/.test(t)) {
        if (ALLOWED_FUNCTIONS.includes(t)) {
          exprParts.push(t);
        } else if (t in CONSTANTS) {
          exprParts.push(String(CONSTANTS[t]));
        } else if (t in context.variables) {
          exprParts.push(String(context.variables[t]));
        } else {
          return { value: NaN, error: `Unknown variable: ${t}` };
        }
      } else if (/^[0-9.]/.test(t) || '+-*/%(),'.includes(t)) {
        exprParts.push(t);
      } else {
        return { value: NaN, error: `Unexpected token: ${t}` };
      }
    }

    const expr = exprParts.join(' ');
    try {
      const result = safeEval(expr, {}, ALLOWED_FUNCTIONS);
      return { value: result };
    } catch (evalErr) {
      return { value: NaN, error: evalErr instanceof Error ? evalErr.message : 'Evaluation error' };
    }
  } catch (e) {
    return { value: NaN, error: e instanceof Error ? e.message : 'Evaluation error' };
  }
}
