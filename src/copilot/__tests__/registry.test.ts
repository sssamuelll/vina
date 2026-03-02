import { describe, it, expect, beforeEach } from 'vitest';
import { ToolRegistry, ToolDefinition, ToolResult } from '../action/tools/registry';

// Helper: create a simple tool definition
function createMockTool(name: string, required?: string[]): ToolDefinition {
  return {
    name,
    description: `Test tool: ${name}`,
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name parameter' },
        count: { type: 'number', description: 'Count parameter' },
        mode: { type: 'string', enum: ['a', 'b', 'c'], description: 'Mode' },
      },
      required: required || ['name'],
    },
    execute: async (): Promise<ToolResult> => ({ success: true, data: { id: '123' } }),
  };
}

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  describe('register', () => {
    it('should register a tool', () => {
      registry.register(createMockTool('testTool'));
      expect(registry.has('testTool')).toBe(true);
      expect(registry.size).toBe(1);
    });

    it('should throw on duplicate registration', () => {
      registry.register(createMockTool('testTool'));
      expect(() => registry.register(createMockTool('testTool'))).toThrow(
        'Tool "testTool" is already registered',
      );
    });

    it('should register multiple tools via registerAll', () => {
      registry.registerAll([
        createMockTool('tool1'),
        createMockTool('tool2'),
        createMockTool('tool3'),
      ]);
      expect(registry.size).toBe(3);
    });
  });

  describe('get', () => {
    it('should return a registered tool', () => {
      const tool = createMockTool('myTool');
      registry.register(tool);
      expect(registry.get('myTool')).toBe(tool);
    });

    it('should return undefined for unregistered tool', () => {
      expect(registry.get('nonexistent')).toBeUndefined();
    });
  });

  describe('list and listNames', () => {
    it('should list all tools', () => {
      registry.registerAll([
        createMockTool('alpha'),
        createMockTool('beta'),
      ]);
      expect(registry.list().length).toBe(2);
      expect(registry.listNames()).toEqual(['alpha', 'beta']);
    });

    it('should return empty arrays when no tools registered', () => {
      expect(registry.list()).toEqual([]);
      expect(registry.listNames()).toEqual([]);
    });
  });

  describe('validate', () => {
    beforeEach(() => {
      registry.register(createMockTool('validateTool', ['name']));
    });

    it('should pass valid params', () => {
      const result = registry.validate('validateTool', { name: 'test' });
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should fail on missing required param', () => {
      const result = registry.validate('validateTool', {});
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required parameter: "name"');
    });

    it('should fail on wrong type', () => {
      const result = registry.validate('validateTool', { name: 'test', count: 'not a number' });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('count'))).toBe(true);
    });

    it('should fail on invalid enum value', () => {
      const result = registry.validate('validateTool', { name: 'test', mode: 'invalid' });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('mode'))).toBe(true);
    });

    it('should pass valid enum value', () => {
      const result = registry.validate('validateTool', { name: 'test', mode: 'a' });
      expect(result.valid).toBe(true);
    });

    it('should return error for unknown tool', () => {
      const result = registry.validate('nonexistent', { name: 'test' });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('not found');
    });

    it('should allow extra params', () => {
      const result = registry.validate('validateTool', { name: 'test', extra: 'value' });
      expect(result.valid).toBe(true);
    });
  });

  describe('toOpenAITools', () => {
    it('should convert to OpenAI function calling format', () => {
      registry.register(createMockTool('myTool'));
      const tools = registry.toOpenAITools();
      expect(tools.length).toBe(1);
      expect(tools[0].type).toBe('function');
      expect(tools[0].function.name).toBe('myTool');
      expect(tools[0].function.description).toBe('Test tool: myTool');
      expect(tools[0].function.parameters.type).toBe('object');
    });
  });

  describe('toAnthropicTools', () => {
    it('should convert to Anthropic tool format', () => {
      registry.register(createMockTool('myTool'));
      const tools = registry.toAnthropicTools();
      expect(tools.length).toBe(1);
      expect(tools[0].name).toBe('myTool');
      expect(tools[0].description).toBe('Test tool: myTool');
      expect(tools[0].input_schema.type).toBe('object');
    });
  });

  describe('has', () => {
    it('should return true for registered tools', () => {
      registry.register(createMockTool('exists'));
      expect(registry.has('exists')).toBe(true);
      expect(registry.has('noexist')).toBe(false);
    });
  });
});
