/**
 * Formula Plugin — allows plugins to register custom formulas.
 *
 * Custom formulas integrate with the existing formula engine and are
 * available to the agent and to skill construction steps.
 *
 * @module plugins/formulaPlugin
 */

import { evaluateFormula, getFormulaVariables, validateFormula } from '../../utils/formula';
import type { FormulaContext } from '../../utils/formula';

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * A custom formula registered by a plugin.
 */
export interface CustomFormula {
  /** Unique formula name (namespaced as `${pluginId}.${name}` in registry) */
  name: string;
  /** Mathematical expression using variable names */
  expression: string;
  /** Variable names this formula expects */
  variables: string[];
  /** Human-readable description */
  description: string;
  /** Plugin id that registered this formula */
  pluginId: string;
}

/**
 * Result of validating a custom formula.
 */
export interface FormulaValidationResult {
  /** Whether the formula is valid */
  valid: boolean;
  /** Error message if invalid */
  error?: string;
  /** Result of evaluating with mock values */
  testResult?: number;
}

// ─── Custom Formula Registry ────────────────────────────────────────────────

/** Registered custom formulas keyed by namespaced name */
const customFormulas: Map<string, CustomFormula> = new Map();

/**
 * Validate a custom formula by parsing and evaluating it with mock values.
 *
 * Creates a mock context where all variables are set to 50 (a typical
 * body measurement value in cm), then attempts evaluation.
 *
 * @param name - Formula name
 * @param expression - Mathematical expression
 * @param variables - Variable names the formula references
 * @returns Validation result with test evaluation
 */
export function validateCustomFormula(
  name: string,
  expression: string,
  variables: string[],
): FormulaValidationResult {
  // Basic checks
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return { valid: false, error: 'Formula name is required' };
  }
  if (!expression || typeof expression !== 'string' || expression.trim().length === 0) {
    return { valid: false, error: 'Formula expression is required' };
  }
  if (!Array.isArray(variables)) {
    return { valid: false, error: 'Variables must be an array' };
  }

  // Check that declared variables match the expression
  const extractedVars = getFormulaVariables(expression);
  for (const v of extractedVars) {
    if (!variables.includes(v)) {
      return { valid: false, error: `Expression references undeclared variable "${v}"` };
    }
  }

  // Build mock context with all variables set to 50
  const mockVars: Record<string, number> = {};
  for (const v of variables) {
    mockVars[v] = 50;
  }
  const mockContext: FormulaContext = { variables: mockVars };

  // Validate with the formula engine
  const validation = validateFormula(expression, mockContext);
  if (!validation.valid) {
    return { valid: false, error: validation.error };
  }

  // Evaluate to get test result
  const evalResult = evaluateFormula(expression, mockContext);
  if (evalResult.error) {
    return { valid: false, error: evalResult.error };
  }

  return { valid: true, testResult: evalResult.value };
}

/**
 * Register a custom formula from a plugin.
 *
 * The formula is validated before registration. The name is automatically
 * namespaced as `${pluginId}.${name}`.
 *
 * @param pluginId - The owning plugin's id
 * @param name - Formula name (will be namespaced)
 * @param expression - Mathematical expression
 * @param variables - Variable names the formula references
 * @param description - Human-readable description (default: empty)
 * @returns The validation result
 * @throws Error if formula is invalid or name already registered
 */
export function registerFormula(
  pluginId: string,
  name: string,
  expression: string,
  variables: string[],
  description: string = '',
): FormulaValidationResult {
  const validation = validateCustomFormula(name, expression, variables);
  if (!validation.valid) {
    return validation;
  }

  const namespacedName = `${pluginId}.${name}`;
  if (customFormulas.has(namespacedName)) {
    return { valid: false, error: `Formula "${namespacedName}" is already registered` };
  }

  customFormulas.set(namespacedName, {
    name: namespacedName,
    expression,
    variables,
    description,
    pluginId,
  });

  return validation;
}

/**
 * Unregister all formulas from a specific plugin.
 *
 * @param pluginId - The plugin id whose formulas to remove
 * @returns Number of formulas removed
 */
export function unregisterPluginFormulas(pluginId: string): number {
  let removed = 0;
  for (const [key, formula] of customFormulas.entries()) {
    if (formula.pluginId === pluginId) {
      customFormulas.delete(key);
      removed++;
    }
  }
  return removed;
}

/**
 * Get a custom formula by its namespaced name.
 *
 * @param namespacedName - The full `pluginId.formulaName` key
 * @returns The custom formula, or undefined
 */
export function getCustomFormula(namespacedName: string): CustomFormula | undefined {
  return customFormulas.get(namespacedName);
}

/**
 * List all registered custom formulas.
 *
 * @returns Array of custom formula entries
 */
export function listCustomFormulas(): CustomFormula[] {
  return Array.from(customFormulas.values());
}

/**
 * List custom formulas from a specific plugin.
 *
 * @param pluginId - The plugin id to filter by
 * @returns Array of custom formulas from that plugin
 */
export function listPluginFormulas(pluginId: string): CustomFormula[] {
  return Array.from(customFormulas.values()).filter(f => f.pluginId === pluginId);
}

/**
 * Evaluate a registered custom formula with provided variable values.
 *
 * @param namespacedName - The full `pluginId.formulaName` key
 * @param variables - Variable name → value mapping
 * @returns The computed value, or an error
 */
export function evaluateCustomFormula(
  namespacedName: string,
  variables: Record<string, number>,
): { value: number; error?: string } {
  const formula = customFormulas.get(namespacedName);
  if (!formula) {
    return { value: NaN, error: `Unknown formula: "${namespacedName}"` };
  }

  // Check all required variables are provided
  for (const v of formula.variables) {
    if (!(v in variables)) {
      return { value: NaN, error: `Missing variable: "${v}"` };
    }
  }

  const context: FormulaContext = { variables };
  return evaluateFormula(formula.expression, context);
}

/**
 * Reset all custom formulas (for testing).
 */
export function resetCustomFormulas(): void {
  customFormulas.clear();
}
