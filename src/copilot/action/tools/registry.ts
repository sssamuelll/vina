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
import { tools as templateToolDefs } from './definitions/templateTools';
import { tools as fabricToolDefs } from './definitions/fabricTools';
import { tools as semanticToolDefs } from './definitions/semanticTools';
import { tools as constructionToolDefs } from './definitions/constructionTools';
import { tools as blueprintToolDefs } from './definitions/blueprintTools';
import { tools as seamlyToolDefs } from './definitions/seamlyTools';
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
import { tools as annotationToolDefs } from './definitions/annotationTools';

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
    }

    return tool.execute(validatedParams, this.dispatch, this.getState);
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
  templateToolDefs,
  fabricToolDefs,
  semanticToolDefs,
  constructionToolDefs,
  blueprintToolDefs,
  seamlyToolDefs,
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
  annotationToolDefs,
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
