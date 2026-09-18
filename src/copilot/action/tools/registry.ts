/**
 * Tool Registry — registers, validates, and retrieves LLM-callable tools.
 *
 * Each tool has a name, description (bilingual ES/EN for patronaje context),
 * a JSON Schema for parameters, and an execute function that dispatches
 * to the Redux store.
 *
 * @module ToolRegistry
 */

import { z } from 'zod';
import type { AppDispatch, RootState } from '../../../store';
import { withAgentHistorySource } from '../../../store/undoMiddleware';
import { validateToolParams } from './validation';
import { tools as pieceToolDefs } from './definitions/pieceTools';
import { tools as internalToolDefs } from './definitions/internalTools';
import { tools as seamToolDefs } from './definitions/seamTools';
import { tools as gradingToolDefs } from './definitions/gradingTools';
import { tools as nestingToolDefs } from './definitions/nestingTools';
import { tools as exportToolDefs } from './definitions/exportTools';
import { tools as measurementToolDefs } from './definitions/measurementTools';
import { tools as simulationToolDefs } from './definitions/simulationTools';
import { tools as editorToolDefs } from './definitions/editorTools';
import { tools as analysisToolDefs } from './definitions/analysisTools';
import { tools as compoundToolDefs } from './definitions/compoundTools';
import { tools as autoSewToolDefs } from './definitions/autoSewTools';
import { tools as fabricToolDefs } from './definitions/fabricTools';
import { tools as semanticToolDefs } from './definitions/semanticTools';
import { tools as constructionToolDefs } from './definitions/constructionTools';
// blueprintTools un-registered (#847): dormant, agent-unreachable. Source retained for #53.
import { tools as garmentPipelineToolDefs } from './definitions/garmentPipelineTool';
import { tools as edgeToolDefs } from './definitions/edgeTools';
import { tools as dartToolDefs } from './definitions/dartTools';
import { tools as easeToolDefs } from './definitions/easeTools';
import { tools as patternOpsToolDefs } from './definitions/patternOpsTools';
import { tools as ruleToolDefs } from './definitions/ruleTools';
import { tools as uiStateToolDefs } from './definitions/uiStateTools';
import { tools as memoryToolDefs } from './definitions/memoryTools';
import { tools as uiBridgeToolDefs } from './definitions/uiBridgeTools';
import { tools as modifyDimensionToolDefs } from './definitions/modifyDimensionTools';
import { tools as threeDInteractionToolDefs } from './definitions/3dInteractionTools';
import { tools as groupToolDefs } from './definitions/groupTools';
import { tools as layerToolDefs } from './definitions/layerTools';
import { tools as pomToolDefs } from './definitions/pomTools';
import { tools as sewingEnhancementToolDefs } from './definitions/sewingEnhancementTools';
import { tools as renderToolDefs } from './definitions/renderTools';
import { tools as meshSelectionToolDefs } from './definitions/meshSelectionTools';
import { tools as colorwayToolDefs } from './definitions/colorwayTools';
import { tools as garmentInfoToolDefs } from './definitions/garmentInfoTools';
import { tools as annotationToolDefs } from './definitions/annotationTools';
import { tools as pleatToolDefs } from './definitions/pleatTools';
import { tools as elasticToolDefs } from './definitions/elasticTools';
import { tools as referenceImageToolDefs } from './definitions/referenceImageTools';
import { tools as dxfToolDefs } from './definitions/dxfTools';
import { tools as placementRuleToolDefs } from './definitions/placementRuleTools';
import { tools as bomToolDefs } from './definitions/bomTools';
import { tools as trimToolDefs } from './definitions/trimTools';
import { tools as artworkToolDefs } from './definitions/artworkTools';

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Result returned by a tool's execute function.
 */
export interface ToolResult {
  /** Whether the tool executed successfully */
  success: boolean;
  /** Result data (tool-specific) */
  data?: Record<string, unknown>;
  /** Error message if success is false */
  error?: string;
  /** Optional function to rollback/undo this tool's changes */
  rollback?: () => void;
}

/**
 * JSON Schema definition for tool parameters (OpenAI function calling format).
 */
export interface ToolParametersSchema {
  type: 'object';
  properties: Record<string, JSONSchemaProperty>;
  required?: string[];
}

/**
 * Individual property within a JSON Schema.
 */
export interface JSONSchemaProperty {
  type: string;
  description?: string;
  enum?: (string | number | boolean)[];
  default?: unknown;
  items?: JSONSchemaProperty;
  properties?: Record<string, JSONSchemaProperty>;
  required?: string[];
}

/**
 * A tool definition that can be called by an LLM.
 */
export interface ToolDefinition {
  /** Unique tool name (e.g. 'createPiece') */
  name: string;
  /** Description for the LLM — bilingual ES/EN, using patronaje terminology */
  description: string;
  /** JSON Schema for parameters in OpenAI function calling format */
  parameters: ToolParametersSchema;
  /** Optional Zod schema for runtime validation */
  schema?: z.ZodSchema;
  /** Execute the tool with validated params */
  execute: (
    params: Record<string, unknown>,
    dispatch: AppDispatch,
    getState: () => RootState,
  ) => Promise<ToolResult>;
}

/**
 * OpenAI-compatible tool format for LLM function calling.
 */
export interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: ToolParametersSchema;
  };
}

// ─── Coerción ───────────────────────────────────────────────────────────────

/**
 * Lleva a su tipo los escalares que el function-calling manda como string.
 *
 * Un LLM manda `"5"` donde el schema dice `number` y `"false"` donde dice
 * `boolean` con toda naturalidad. Rechazarlos a secas apagaría llamadas que
 * hoy funcionan, así que primero se coercionan y solo lo que no se puede
 * coercionar cae en `validate()` y se rechaza allí.
 *
 * `"false"` es truthy en JS: ese es exactamente el fallo de #1189 — entraba
 * en la rama destructiva de `offsetPattern` y reportaba `replaced: true`.
 * Por eso solo `"true"` y `"false"` se convierten: cualquier otra cadena se
 * deja pasar tal cual para que el validador la rechace en vez de adivinar.
 */
function coerceToSchema(
  schema: ToolParametersSchema,
  params: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...params };
  for (const [key, value] of Object.entries(out)) {
    if (typeof value !== 'string') continue;
    const expected = schema.properties[key]?.type;
    if (expected === 'boolean') {
      if (value === 'true') out[key] = true;
      else if (value === 'false') out[key] = false;
    } else if (expected === 'number' || expected === 'integer') {
      const n = Number(value);
      if (value.trim() !== '' && Number.isFinite(n)) out[key] = n;
    }
  }
  return out;
}

// ─── Registry ───────────────────────────────────────────────────────────────

/**
 * Central registry for all LLM-callable tools.
 *
 * @example
 * ```ts
 * const registry = new ToolRegistry();
 * registry.register(createPieceTool);
 * const tool = registry.get('createPiece');
 * ```
 */
export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();
  private dispatch: AppDispatch | null = null;
  private getState: (() => RootState) | null = null;

  /**
   * Set the Redux dispatch and getState functions.
   * Must be called before using execute().
   * @param dispatch - Redux dispatch function
   * @param getState - Function that returns the current Redux state
   */
  setContext(dispatch: AppDispatch, getState: () => RootState): void {
    this.dispatch = dispatch;
    this.getState = getState;
  }

  /**
   * Register a tool definition.
   * @param tool - The tool to register
   * @throws Error if a tool with the same name is already registered
   */
  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered`);
    }
    this.tools.set(tool.name, tool);
  }

  /**
   * Register multiple tools at once.
   * @param tools - Array of tool definitions
   */
  registerAll(tools: ToolDefinition[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  /**
   * Get a tool by name.
   * @param name - Tool name
   * @returns The tool definition, or undefined if not found
   */
  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * List all registered tools.
   * @returns Array of all tool definitions
   */
  list(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * List all tool names.
   * @returns Array of tool name strings
   */
  listNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Get the count of registered tools.
   */
  get size(): number {
    return this.tools.size;
  }

  /**
   * Check if a tool is registered.
   * @param name - Tool name to check
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Validate parameters against a tool's JSON Schema.
   *
   * Performs basic validation: checks required fields and type matching.
   * Does not perform full JSON Schema validation (no $ref, allOf, etc.).
   *
   * @param toolName - Name of the tool
   * @param params - Parameters to validate
   * @returns Object with valid flag and optional errors array
   */
  validate(toolName: string, params: Record<string, unknown>): { valid: boolean; errors: string[] } {
    const tool = this.tools.get(toolName);
    if (!tool) {
      return { valid: false, errors: [`Tool "${toolName}" not found`] };
    }

    const errors: string[] = [];
    const schema = tool.parameters;

    // Check required fields
    if (schema.required) {
      for (const field of schema.required) {
        if (params[field] === undefined || params[field] === null) {
          errors.push(`Missing required parameter: "${field}"`);
        }
      }
    }

    // Check types of provided fields
    for (const [key, value] of Object.entries(params)) {
      const propSchema = schema.properties[key];
      if (!propSchema) {
        // Extra params are allowed (LLMs may send them)
        continue;
      }

      if (value === undefined || value === null) continue;

      const expectedType = propSchema.type;
      const actualType = Array.isArray(value) ? 'array' : typeof value;

      if (expectedType === 'integer') {
        if (typeof value !== 'number' || !Number.isInteger(value)) {
          errors.push(`Parameter "${key}" must be an integer, got ${typeof value}`);
        }
      } else if (expectedType === 'number') {
        if (typeof value !== 'number') {
          errors.push(`Parameter "${key}" must be a number, got ${typeof value}`);
        }
      } else if (expectedType !== actualType) {
        errors.push(`Parameter "${key}" must be ${expectedType}, got ${actualType}`);
      }

      // Check enum
      if (propSchema.enum && !propSchema.enum.includes(value as string | number | boolean)) {
        errors.push(`Parameter "${key}" must be one of: ${propSchema.enum.join(', ')}`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Execute a tool by name with the given parameters.
   *
   * If the tool has a Zod schema, parameters are validated before execution.
   * Requires setContext() to have been called first.
   *
   * @param name - Name of the tool to execute
   * @param params - Parameters to pass to the tool
   * @returns ToolResult with success status and data or error
   */
  async execute(name: string, params: unknown): Promise<ToolResult> {
    const tool = this.get(name);
    if (!tool) {
      return { success: false, error: `Unknown tool: ${name}` };
    }

    if (!this.dispatch || !this.getState) {
      return { success: false, error: 'Registry context not set. Call setContext() first.' };
    }

    // Validate with Zod if schema exists
    let validatedParams = params as Record<string, unknown>;
    if (tool.schema) {
      const validated = validateToolParams(tool.schema, params);
      if (!validated.success) {
        return { success: false, error: validated.error };
      }
      validatedParams = validated.data as Record<string, unknown>;
    } else {
      // #1189 — hoy NINGUNA de las 46 definiciones trae `schema` zod, así que
      // la rama de arriba no corre nunca y el camino vivo entraba sin validar
      // nada. `validate()` (el validador contra el JSON schema que las tools
      // sí declaran) estaba escrito y solo lo llamaba `toolExecutor.ts`, que
      // no importa nadie fuera de tests.
      //
      // La guardia va aquí y no en `AgenticLoop` porque `execute` es el único
      // paso por el que entran todas las tools y todos sus llamadores: cubre
      // de una vez los 415 casts `params.x as T` de los 28 archivos que los
      // leen sin mirar.
      const coerced = coerceToSchema(tool.parameters, (params ?? {}) as Record<string, unknown>);
      const check = this.validate(name, coerced);
      if (!check.valid) {
        return { success: false, error: check.errors.join(', ') };
      }
      validatedParams = coerced;
    }

    const dispatchAsAgent = ((action: Parameters<AppDispatch>[0]) =>
      withAgentHistorySource(name, () => this.dispatch!(action))
    ) as AppDispatch;

    return tool.execute(validatedParams, dispatchAsAgent, this.getState);
  }

  /**
   * Convert all tools to OpenAI function calling format.
   * @returns Array of OpenAI-compatible tool definitions
   */
  toOpenAITools(): OpenAITool[] {
    return this.list().map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  /**
   * Convert all tools to Anthropic tool format.
   * @returns Array of Anthropic-compatible tool definitions
   */
  toAnthropicTools(): Array<{ name: string; description: string; input_schema: ToolParametersSchema }> {
    return this.list().map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters,
    }));
  }
}

// ─── Default Registry Instance ──────────────────────────────────────────────

/** All tool definition arrays, collected for bulk registration. */
const ALL_TOOL_MODULES: ToolDefinition[][] = [
  pieceToolDefs,
  internalToolDefs,
  seamToolDefs,
  gradingToolDefs,
  nestingToolDefs,
  exportToolDefs,
  measurementToolDefs,
  simulationToolDefs,
  editorToolDefs,
  analysisToolDefs,
  compoundToolDefs,
  autoSewToolDefs,
  fabricToolDefs,
  semanticToolDefs,
  constructionToolDefs,
  garmentPipelineToolDefs,
  edgeToolDefs,
  dartToolDefs,
  easeToolDefs,
  patternOpsToolDefs,
  ruleToolDefs,
  uiStateToolDefs,
  memoryToolDefs,
  uiBridgeToolDefs,
  modifyDimensionToolDefs,
  threeDInteractionToolDefs,
  groupToolDefs,
  layerToolDefs,
  pomToolDefs,
  sewingEnhancementToolDefs,
  renderToolDefs,
  meshSelectionToolDefs,
  colorwayToolDefs,
  garmentInfoToolDefs,
  annotationToolDefs,
  pleatToolDefs,
  elasticToolDefs,
  referenceImageToolDefs,
  dxfToolDefs,
  placementRuleToolDefs,
  bomToolDefs,
  trimToolDefs,
  artworkToolDefs,
];

let _defaultRegistry: ToolRegistry | null = null;

/**
 * Get or create the default global tool registry with all tools registered.
 * @returns The default ToolRegistry instance with all tools loaded
 */
export function getDefaultRegistry(): ToolRegistry {
  if (!_defaultRegistry) {
    _defaultRegistry = new ToolRegistry();
    for (const tools of ALL_TOOL_MODULES) {
      _defaultRegistry.registerAll(tools);
    }
  }
  return _defaultRegistry;
}

/**
 * Reset the default registry (useful for testing).
 */
export function resetDefaultRegistry(): void {
  _defaultRegistry = null;
}
