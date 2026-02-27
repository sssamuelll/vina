/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
/**
 * Copilot Tool Schema Generator
 *
 * Converts internal ToolDefinition format to LLM-compatible schemas
 * for OpenAI function calling and Anthropic tool use.
 */

import { toolRegistry } from './registry';
import type { ToolDefinition, ToolOption, ToolContext } from './types';

// ============================================================================
// Schema Types
// ============================================================================

/** OpenAI-compatible function schema */
export interface OpenAIFunctionSchema {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, OpenAIPropertySchema>;
    required: string[];
  };
}

interface OpenAIPropertySchema {
  type: 'string' | 'number' | 'boolean' | 'array';
  description?: string;
  enum?: (string | number)[];
  minimum?: number;
  maximum?: number;
  default?: any;
}

/** Anthropic-compatible tool schema */
export interface AnthropicToolSchema {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, AnthropicPropertySchema>;
    required: string[];
  };
}

interface AnthropicPropertySchema {
  type: 'string' | 'number' | 'boolean' | 'array';
  description?: string;
  enum?: (string | number)[];
  minimum?: number;
  maximum?: number;
  default?: any;
}

/** Unified copilot tool schema (for internal use) */
export interface CopilotToolSchema {
  id: string;
  name: string;
  description: string;
  context: ToolContext;
  parameters: CopilotParameterSchema[];
  examples: string[];
  keywords: string[];
  requiresSelection?: string;
  produces?: string;
  undoable?: boolean;
  dangerous?: boolean;
}

interface CopilotParameterSchema {
  id: string;
  name: string;
  type: 'number' | 'string' | 'boolean';
  description: string;
  required: boolean;
  default?: any;
  enum?: (string | number)[];
  minimum?: number;
  maximum?: number;
}

// ============================================================================
// Schema Generation
// ============================================================================

/**
 * Convert a ToolOption to a parameter schema
 */
function optionToParameter(option: ToolOption, hint?: string): CopilotParameterSchema {
  const baseSchema: CopilotParameterSchema = {
    id: option.id,
    name: option.label,
    type: option.type === 'toggle' ? 'boolean' : option.type === 'number' ? 'number' : 'string',
    description: hint || option.label,
    required: false,
    default: option.value,
  };

  if (option.type === 'number') {
    baseSchema.minimum = option.min;
    baseSchema.maximum = option.max;
  }

  if (option.type === 'select' && option.choices) {
    baseSchema.enum = option.choices.map(c => c.value);
  }

  return baseSchema;
}

/**
 * Convert a ToolDefinition to a CopilotToolSchema
 */
export function toolToSchema(tool: ToolDefinition): CopilotToolSchema | null {
  // Skip tools without copilot metadata
  if (!tool.copilot) {
    return null;
  }

  const parameters: CopilotParameterSchema[] = (tool.options || []).map(opt =>
    optionToParameter(opt, tool.copilot?.parameterHints?.[opt.id])
  );

  return {
    id: tool.id,
    name: tool.name,
    description: tool.copilot.description,
    context: tool.context,
    parameters,
    examples: tool.copilot.examples,
    keywords: tool.copilot.keywords,
    requiresSelection: tool.copilot.requiresSelection,
    produces: tool.copilot.produces,
    undoable: tool.copilot.undoable,
    dangerous: tool.copilot.dangerous,
  };
}

/**
 * Generate schemas for all registered tools
 */
export function generateToolSchemas(context?: ToolContext): CopilotToolSchema[] {
  const tools = context
    ? toolRegistry.getToolsByContext(context)
    : toolRegistry.getAllTools();

  return tools
    .map(toolToSchema)
    .filter((schema): schema is CopilotToolSchema => schema !== null);
}

// ============================================================================
// LLM-Specific Exports
// ============================================================================

/**
 * Convert to OpenAI function calling format
 */
export function toOpenAIFunctions(schemas: CopilotToolSchema[]): OpenAIFunctionSchema[] {
  return schemas.map(schema => ({
    name: `tool_${schema.id}`,
    description: schema.description,
    parameters: {
      type: 'object' as const,
      properties: Object.fromEntries(
        schema.parameters.map(param => [
          param.id,
          {
            type: param.type,
            description: param.description,
            ...(param.enum && { enum: param.enum }),
            ...(param.minimum !== undefined && { minimum: param.minimum }),
            ...(param.maximum !== undefined && { maximum: param.maximum }),
            ...(param.default !== undefined && { default: param.default }),
          },
        ])
      ),
      required: schema.parameters.filter(p => p.required).map(p => p.id),
    },
  }));
}

/**
 * Convert to Anthropic tool use format
 */
export function toAnthropicTools(schemas: CopilotToolSchema[]): AnthropicToolSchema[] {
  return schemas.map(schema => ({
    name: `tool_${schema.id}`,
    description: schema.description,
    input_schema: {
      type: 'object' as const,
      properties: Object.fromEntries(
        schema.parameters.map(param => [
          param.id,
          {
            type: param.type,
            description: param.description,
            ...(param.enum && { enum: param.enum }),
            ...(param.minimum !== undefined && { minimum: param.minimum }),
            ...(param.maximum !== undefined && { maximum: param.maximum }),
            ...(param.default !== undefined && { default: param.default }),
          },
        ])
      ),
      required: schema.parameters.filter(p => p.required).map(p => p.id),
    },
  }));
}

/**
 * Generate a system prompt section describing available tools
 */
export function generateToolsPromptSection(context?: ToolContext): string {
  const schemas = generateToolSchemas(context);

  const lines = [
    '## Available Tools\n',
    'You can activate and configure the following tools:\n',
  ];

  for (const schema of schemas) {
    lines.push(`### ${schema.name} (\`${schema.id}\`)`);
    lines.push(schema.description);

    if (schema.parameters.length > 0) {
      lines.push('\n**Parameters:**');
      for (const param of schema.parameters) {
        const typeInfo = param.enum
          ? `one of: ${param.enum.join(', ')}`
          : param.type;
        lines.push(`- \`${param.id}\` (${typeInfo}): ${param.description}`);
      }
    }

    if (schema.examples.length > 0) {
      lines.push('\n**Examples:**');
      for (const example of schema.examples) {
        lines.push(`- "${example}"`);
      }
    }

    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Find tools matching a natural language query
 */
export function findToolsByQuery(query: string, context?: ToolContext): CopilotToolSchema[] {
  const schemas = generateToolSchemas(context);
  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/);

  return schemas
    .map(schema => {
      let score = 0;

      // Check name match
      if (schema.name.toLowerCase().includes(queryLower)) score += 10;

      // Check keyword matches
      for (const keyword of schema.keywords) {
        if (queryLower.includes(keyword.toLowerCase())) score += 5;
        for (const word of queryWords) {
          if (keyword.toLowerCase().includes(word)) score += 2;
        }
      }

      // Check example matches
      for (const example of schema.examples) {
        if (example.toLowerCase().includes(queryLower)) score += 3;
        for (const word of queryWords) {
          if (example.toLowerCase().includes(word)) score += 1;
        }
      }

      return { schema, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ schema }) => schema);
}
