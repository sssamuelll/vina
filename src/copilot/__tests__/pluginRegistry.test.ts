import { describe, it, expect, beforeEach } from 'vitest';
import { PluginRegistry } from '../plugins/pluginRegistry';
import type { OpenCloPlugin, PluginPermission } from '../plugins/types';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makePlugin(id: string, overrides?: Partial<OpenCloPlugin>): OpenCloPlugin {
  return {
    id,
    name: `Plugin ${id}`,
    version: '1.0.0',
    author: 'Test',
    description: 'Test plugin',
    license: 'MIT',
    compatibleWith: '>=0.4.0',
    ...overrides,
  };
}

function makePluginWithTool(
  id: string,
  toolName: string,
  permissions: PluginPermission[] = ['read-pieces'],
): OpenCloPlugin {
  return makePlugin(id, {
    tools: [{
      name: toolName,
      description: `Tool ${toolName}`,
      parameters: { type: 'object', properties: {} },
      requiredPermissions: permissions,
      handler: async () => ({ success: true }),
    }],
  });
}

function makePluginWithSkill(id: string, skillName: string): OpenCloPlugin {
  return makePlugin(id, {
    skills: [{
      skill: {
        name: skillName,
        triggers: [`trigger-${skillName}`],
        description: `Skill ${skillName}`,
        methods: [{ name: 'Default', origin: 'US', description: 'Default method', formulas: {} }],
        formulas: {},
        easeTable: {},
        constructionSteps: [{ order: 1, instruction: 'Step 1', toolCalls: [] }],
      },
    }],
  });
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('PluginRegistry', () => {
  let registry: PluginRegistry;

  beforeEach(() => {
    registry = new PluginRegistry();
  });

  describe('registerPlugin — tools', () => {
    it('should register plugin tools with namespaced names', () => {
      const plugin = makePluginWithTool('com.test.p1', 'myTool');
      const conflicts = registry.registerPlugin(plugin, ['read-pieces']);
      expect(conflicts).toHaveLength(0);
      expect(registry.toolCount).toBe(1);
      expect(registry.hasTool('com.test.p1.myTool')).toBe(true);
    });

    it('should include plugin id in tool description', () => {
      const plugin = makePluginWithTool('com.test.p1', 'myTool');
      registry.registerPlugin(plugin, ['read-pieces']);
      const defs = registry.getToolDefinitions();
      expect(defs[0].description).toContain('com.test.p1');
    });

    it('should detect tool name conflicts between plugins', () => {
      const p1 = makePluginWithTool('com.test.p1', 'myTool');
      const p2 = makePluginWithTool('com.test.p1', 'myTool'); // same namespaced name
      registry.registerPlugin(p1, ['read-pieces']);
      const conflicts = registry.registerPlugin(p2, ['read-pieces']);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].type).toBe('tool');
      expect(conflicts[0].name).toBe('com.test.p1.myTool');
    });

    it('should NOT conflict when different plugins use same raw tool name', () => {
      const p1 = makePluginWithTool('com.test.p1', 'analyze');
      const p2 = makePluginWithTool('com.test.p2', 'analyze');
      registry.registerPlugin(p1, ['read-pieces']);
      const conflicts = registry.registerPlugin(p2, ['read-pieces']);
      expect(conflicts).toHaveLength(0);
      expect(registry.toolCount).toBe(2);
    });

    it('should enforce permissions at tool execution time', async () => {
      const plugin = makePluginWithTool('com.test.p1', 'writeTool', ['write-pieces']);
      registry.registerPlugin(plugin, ['read-pieces']); // NOT granted write-pieces

      const defs = registry.getToolDefinitions();
      const tool = defs.find(t => t.name === 'com.test.p1.writeTool')!;
      const result = await tool.execute({}, undefined as never, undefined as never);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Permission denied');
    });

    it('should allow tool execution when permissions are granted', async () => {
      const plugin = makePluginWithTool('com.test.p1', 'readTool', ['read-pieces']);
      registry.registerPlugin(plugin, ['read-pieces']);

      const defs = registry.getToolDefinitions();
      const tool = defs.find(t => t.name === 'com.test.p1.readTool')!;
      const result = await tool.execute({}, undefined as never, undefined as never);
      expect(result.success).toBe(true);
    });
  });

  describe('registerPlugin — skills', () => {
    it('should register plugin skills', () => {
      const plugin = makePluginWithSkill('com.test.p1', 'custom-bodice');
      const conflicts = registry.registerPlugin(plugin, []);
      expect(conflicts).toHaveLength(0);
      expect(registry.skillCount).toBe(1);
    });

    it('should detect skill name conflicts', () => {
      const p1 = makePluginWithSkill('com.test.p1', 'bodice');
      const p2 = makePluginWithSkill('com.test.p1', 'bodice');
      registry.registerPlugin(p1, []);
      const conflicts = registry.registerPlugin(p2, []);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].type).toBe('skill');
    });
  });

  describe('registerPlugin — fabrics', () => {
    it('should register plugin fabrics with namespaced ids', () => {
      const plugin = makePlugin('com.test.p1', {
        fabrics: [{
          id: 'custom-silk',
          material: {
            name: 'Custom Silk',
            weight: 80,
            stretchStiffness: 0.5,
            bendStiffness: 0.1,
            friction: 0.3,
            thickness: 0.2,
          },
        }],
      });
      const conflicts = registry.registerPlugin(plugin, []);
      expect(conflicts).toHaveLength(0);
      expect(registry.fabricCount).toBe(1);
      const fabrics = registry.getRegisteredFabrics();
      expect(fabrics[0].namespacedId).toBe('com.test.p1.custom-silk');
    });
  });

  describe('registerPlugin — templates', () => {
    it('should register plugin templates', () => {
      const plugin = makePlugin('com.test.p1', {
        templates: [{
          id: 'mini-skirt',
          name: 'Mini Skirt',
          description: 'A mini skirt template',
          category: 'bottoms',
          data: { length: 400 },
        }],
      });
      const conflicts = registry.registerPlugin(plugin, []);
      expect(conflicts).toHaveLength(0);
      expect(registry.templateCount).toBe(1);
    });
  });

  describe('unregisterPlugin', () => {
    it('should remove all assets from a plugin', () => {
      const plugin = makePlugin('com.test.p1', {
        tools: [{
          name: 'aTool',
          description: 'A tool',
          parameters: { type: 'object', properties: {} },
          requiredPermissions: [],
          handler: async () => ({ success: true }),
        }],
        skills: [{
          skill: {
            name: 'aSkill',
            triggers: ['trig'],
            description: 'A skill',
            methods: [{ name: 'D', origin: 'US', description: 'D', formulas: {} }],
            formulas: {},
            easeTable: {},
            constructionSteps: [{ order: 1, instruction: 'S1', toolCalls: [] }],
          },
        }],
      });
      registry.registerPlugin(plugin, []);
      expect(registry.toolCount).toBe(1);
      expect(registry.skillCount).toBe(1);

      registry.unregisterPlugin('com.test.p1');
      expect(registry.toolCount).toBe(0);
      expect(registry.skillCount).toBe(0);
    });

    it('should clean up conflicts on unregister', () => {
      const p1 = makePluginWithTool('com.test.p1', 'sameTool');
      const p2 = makePluginWithTool('com.test.p1', 'sameTool'); // conflict
      registry.registerPlugin(p1, []);
      registry.registerPlugin(p2, []);
      expect(registry.getConflicts()).toHaveLength(1);

      registry.unregisterPlugin('com.test.p1');
      expect(registry.getConflicts()).toHaveLength(0);
    });
  });

  describe('getToolsByPlugin', () => {
    it('should return only tools from specified plugin', () => {
      registry.registerPlugin(makePluginWithTool('com.test.p1', 'toolA'), []);
      registry.registerPlugin(makePluginWithTool('com.test.p2', 'toolB'), []);
      const p1Tools = registry.getToolsByPlugin('com.test.p1');
      expect(p1Tools).toHaveLength(1);
      expect(p1Tools[0].originalName).toBe('toolA');
    });
  });

  describe('reset', () => {
    it('should clear all registrations', () => {
      registry.registerPlugin(makePluginWithTool('com.test.p1', 'tool'), []);
      registry.reset();
      expect(registry.toolCount).toBe(0);
      expect(registry.skillCount).toBe(0);
      expect(registry.fabricCount).toBe(0);
      expect(registry.templateCount).toBe(0);
      expect(registry.getConflicts()).toHaveLength(0);
    });
  });
});
