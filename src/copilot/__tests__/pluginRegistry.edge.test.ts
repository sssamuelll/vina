/**
 * Extended edge-case tests for pluginRegistry.
 *
 * Covers: empty plugins, unregister nonexistent, re-registration,
 * template/fabric conflicts, getter coverage, multiple plugins with
 * mixed asset types.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { PluginRegistry, getDefaultPluginRegistry, resetDefaultPluginRegistry } from '../plugins/pluginRegistry';
import type { VinaPlugin } from '../plugins/types';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makePlugin(id: string, overrides?: Partial<VinaPlugin>): VinaPlugin {
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

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('PluginRegistry — edge cases', () => {
  let registry: PluginRegistry;

  beforeEach(() => {
    registry = new PluginRegistry();
  });

  describe('empty plugin registration', () => {
    it('should register a plugin with no assets (no tools/skills/fabrics/templates)', () => {
      const plugin = makePlugin('com.test.empty');
      const conflicts = registry.registerPlugin(plugin, []);
      expect(conflicts).toHaveLength(0);
      expect(registry.toolCount).toBe(0);
      expect(registry.skillCount).toBe(0);
      expect(registry.fabricCount).toBe(0);
      expect(registry.templateCount).toBe(0);
    });

    it('should register a plugin with empty arrays for all asset types', () => {
      const plugin = makePlugin('com.test.empty', {
        tools: [],
        skills: [],
        fabrics: [],
        templates: [],
      });
      const conflicts = registry.registerPlugin(plugin, []);
      expect(conflicts).toHaveLength(0);
    });
  });

  describe('unregister nonexistent plugin', () => {
    it('should not throw when unregistering a plugin that was never registered', () => {
      expect(() => registry.unregisterPlugin('nonexistent')).not.toThrow();
    });

    it('should not affect other registered plugins', () => {
      const plugin = makePlugin('com.test.p1', {
        tools: [{
          name: 'tool1',
          description: 'T',
          parameters: { type: 'object', properties: {} },
          requiredPermissions: [],
          handler: async () => ({ success: true }),
        }],
      });
      registry.registerPlugin(plugin, []);
      registry.unregisterPlugin('nonexistent');
      expect(registry.toolCount).toBe(1);
    });
  });

  describe('re-registration after unregister', () => {
    it('should allow re-registering a plugin after unregistering', () => {
      const plugin = makePlugin('com.test.p1', {
        tools: [{
          name: 'tool1',
          description: 'T',
          parameters: { type: 'object', properties: {} },
          requiredPermissions: [],
          handler: async () => ({ success: true }),
        }],
      });
      registry.registerPlugin(plugin, []);
      expect(registry.toolCount).toBe(1);

      registry.unregisterPlugin('com.test.p1');
      expect(registry.toolCount).toBe(0);

      // Re-register
      const conflicts = registry.registerPlugin(plugin, []);
      expect(conflicts).toHaveLength(0);
      expect(registry.toolCount).toBe(1);
      expect(registry.hasTool('com.test.p1.tool1')).toBe(true);
    });

    it('should allow re-registering skills after unregister', () => {
      const plugin = makePlugin('com.test.p1', {
        skills: [{
          skill: {
            name: 'my-skill',
            triggers: ['test'],
            description: 'D',
            methods: [{ name: 'M', origin: 'US', description: 'D', formulas: {} }],
            formulas: {},
            easeTable: {},
            constructionSteps: [{ order: 1, instruction: 'S', toolCalls: [] }],
          },
        }],
      });
      registry.registerPlugin(plugin, []);
      expect(registry.skillCount).toBe(1);

      registry.unregisterPlugin('com.test.p1');
      expect(registry.skillCount).toBe(0);

      const conflicts = registry.registerPlugin(plugin, []);
      expect(conflicts).toHaveLength(0);
      expect(registry.skillCount).toBe(1);
    });
  });

  describe('template conflicts', () => {
    it('should detect template name conflicts within same plugin id', () => {
      const p1 = makePlugin('com.test.p1', {
        templates: [{
          id: 'tpl-1',
          name: 'Template 1',
          description: 'T',
          category: 'tops',
          data: {},
        }],
      });
      const p2 = makePlugin('com.test.p1', {
        templates: [{
          id: 'tpl-1',
          name: 'Template 1 duplicate',
          description: 'T2',
          category: 'tops',
          data: {},
        }],
      });
      registry.registerPlugin(p1, []);
      const conflicts = registry.registerPlugin(p2, []);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].type).toBe('template');
      expect(conflicts[0].name).toBe('com.test.p1.tpl-1');
    });

    it('should NOT conflict when different plugins use same template id', () => {
      const p1 = makePlugin('com.test.p1', {
        templates: [{ id: 'tpl-1', name: 'T1', description: 'D', category: 'tops', data: {} }],
      });
      const p2 = makePlugin('com.test.p2', {
        templates: [{ id: 'tpl-1', name: 'T1', description: 'D', category: 'tops', data: {} }],
      });
      registry.registerPlugin(p1, []);
      const conflicts = registry.registerPlugin(p2, []);
      expect(conflicts).toHaveLength(0);
      expect(registry.templateCount).toBe(2);
    });
  });

  describe('fabric conflicts', () => {
    it('should detect fabric id conflicts within same plugin id', () => {
      const p1 = makePlugin('com.test.p1', {
        fabrics: [{
          id: 'silk',
          material: { name: 'Silk', weight: 80, stretchStiffness: 0.5, bendStiffness: 0.1, friction: 0.3, thickness: 0.2 },
        }],
      });
      const p2 = makePlugin('com.test.p1', {
        fabrics: [{
          id: 'silk',
          material: { name: 'Silk v2', weight: 90, stretchStiffness: 0.6, bendStiffness: 0.2, friction: 0.4, thickness: 0.3 },
        }],
      });
      registry.registerPlugin(p1, []);
      const conflicts = registry.registerPlugin(p2, []);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].type).toBe('fabric');
    });

    it('should NOT conflict when different plugins use same fabric id', () => {
      const p1 = makePlugin('com.test.p1', {
        fabrics: [{
          id: 'silk',
          material: { name: 'Silk', weight: 80, stretchStiffness: 0.5, bendStiffness: 0.1, friction: 0.3, thickness: 0.2 },
        }],
      });
      const p2 = makePlugin('com.test.p2', {
        fabrics: [{
          id: 'silk',
          material: { name: 'Silk', weight: 80, stretchStiffness: 0.5, bendStiffness: 0.1, friction: 0.3, thickness: 0.2 },
        }],
      });
      registry.registerPlugin(p1, []);
      const conflicts = registry.registerPlugin(p2, []);
      expect(conflicts).toHaveLength(0);
      expect(registry.fabricCount).toBe(2);
    });
  });

  describe('getter methods coverage', () => {
    it('getRegisteredSkills should return all registered skills', () => {
      const plugin = makePlugin('com.test.p1', {
        skills: [
          {
            skill: {
              name: 's1',
              triggers: ['t1'],
              description: 'D1',
              methods: [{ name: 'M', origin: 'US', description: 'D', formulas: {} }],
              formulas: {},
              easeTable: {},
              constructionSteps: [{ order: 1, instruction: 'S', toolCalls: [] }],
            },
          },
          {
            skill: {
              name: 's2',
              triggers: ['t2'],
              description: 'D2',
              methods: [{ name: 'M', origin: 'US', description: 'D', formulas: {} }],
              formulas: {},
              easeTable: {},
              constructionSteps: [{ order: 1, instruction: 'S', toolCalls: [] }],
            },
          },
        ],
      });
      registry.registerPlugin(plugin, []);
      const skills = registry.getRegisteredSkills();
      expect(skills).toHaveLength(2);
      expect(skills[0].pluginId).toBe('com.test.p1');
    });

    it('getRegisteredTemplates should return all registered templates', () => {
      const plugin = makePlugin('com.test.p1', {
        templates: [
          { id: 't1', name: 'T1', description: 'D', category: 'tops', data: {} },
          { id: 't2', name: 'T2', description: 'D', category: 'bottoms', data: {} },
        ],
      });
      registry.registerPlugin(plugin, []);
      const templates = registry.getRegisteredTemplates();
      expect(templates).toHaveLength(2);
      expect(templates[0].namespacedId).toBe('com.test.p1.t1');
      expect(templates[1].namespacedId).toBe('com.test.p1.t2');
    });

    it('getRegisteredFabrics should return all registered fabrics', () => {
      const plugin = makePlugin('com.test.p1', {
        fabrics: [{
          id: 'silk',
          material: { name: 'Silk', weight: 80, stretchStiffness: 0.5, bendStiffness: 0.1, friction: 0.3, thickness: 0.2 },
        }],
      });
      registry.registerPlugin(plugin, []);
      const fabrics = registry.getRegisteredFabrics();
      expect(fabrics).toHaveLength(1);
      expect(fabrics[0].namespacedId).toBe('com.test.p1.silk');
      expect(fabrics[0].pluginFabric.material.name).toBe('Silk');
    });
  });

  describe('multiple plugins with mixed asset types', () => {
    it('should handle multiple plugins each with tools, skills, fabrics, templates', () => {
      const p1 = makePlugin('com.test.p1', {
        tools: [{ name: 'tool', description: 'T', parameters: { type: 'object', properties: {} }, requiredPermissions: [], handler: async () => ({ success: true }) }],
        skills: [{ skill: { name: 'skill', triggers: ['t'], description: 'D', methods: [{ name: 'M', origin: 'US', description: 'D', formulas: {} }], formulas: {}, easeTable: {}, constructionSteps: [{ order: 1, instruction: 'S', toolCalls: [] }] } }],
        fabrics: [{ id: 'f1', material: { name: 'F', weight: 100, stretchStiffness: 0.5, bendStiffness: 0.1, friction: 0.3, thickness: 0.2 } }],
        templates: [{ id: 't1', name: 'T', description: 'D', category: 'tops', data: {} }],
      });
      const p2 = makePlugin('com.test.p2', {
        tools: [{ name: 'tool', description: 'T2', parameters: { type: 'object', properties: {} }, requiredPermissions: [], handler: async () => ({ success: true }) }],
        skills: [{ skill: { name: 'skill', triggers: ['t2'], description: 'D2', methods: [{ name: 'M', origin: 'US', description: 'D', formulas: {} }], formulas: {}, easeTable: {}, constructionSteps: [{ order: 1, instruction: 'S', toolCalls: [] }] } }],
        fabrics: [{ id: 'f1', material: { name: 'F2', weight: 120, stretchStiffness: 0.6, bendStiffness: 0.2, friction: 0.4, thickness: 0.3 } }],
        templates: [{ id: 't1', name: 'T2', description: 'D2', category: 'bottoms', data: {} }],
      });

      const c1 = registry.registerPlugin(p1, []);
      const c2 = registry.registerPlugin(p2, []);
      expect(c1).toHaveLength(0);
      expect(c2).toHaveLength(0);
      // Different plugins → namespaced differently → no conflicts
      expect(registry.toolCount).toBe(2);
      expect(registry.skillCount).toBe(2);
      expect(registry.fabricCount).toBe(2);
      expect(registry.templateCount).toBe(2);
    });

    it('should unregister one plugin without affecting the other', () => {
      const p1 = makePlugin('com.test.p1', {
        tools: [{ name: 'tool', description: 'T', parameters: { type: 'object', properties: {} }, requiredPermissions: [], handler: async () => ({ success: true }) }],
      });
      const p2 = makePlugin('com.test.p2', {
        tools: [{ name: 'tool', description: 'T2', parameters: { type: 'object', properties: {} }, requiredPermissions: [], handler: async () => ({ success: true }) }],
      });
      registry.registerPlugin(p1, []);
      registry.registerPlugin(p2, []);
      expect(registry.toolCount).toBe(2);

      registry.unregisterPlugin('com.test.p1');
      expect(registry.toolCount).toBe(1);
      expect(registry.hasTool('com.test.p2.tool')).toBe(true);
      expect(registry.hasTool('com.test.p1.tool')).toBe(false);
    });
  });

  describe('permission enforcement at execution time — edge cases', () => {
    it('should deny tool when no permissions were granted', async () => {
      const plugin = makePlugin('com.test.p1', {
        tools: [{
          name: 'netTool',
          description: 'Requires network',
          parameters: { type: 'object', properties: {} },
          requiredPermissions: ['network'],
          handler: async () => ({ success: true, data: { fetched: true } }),
        }],
      });
      registry.registerPlugin(plugin, []); // No permissions granted

      const defs = registry.getToolDefinitions();
      const tool = defs.find(t => t.name === 'com.test.p1.netTool')!;
      const result = await tool.execute({}, undefined as never, undefined as never);
      expect(result.success).toBe(false);
      expect(result.error).toContain('network');
    });

    it('should allow tool with no required permissions even with empty grants', async () => {
      const plugin = makePlugin('com.test.p1', {
        tools: [{
          name: 'freeTool',
          description: 'No permissions needed',
          parameters: { type: 'object', properties: {} },
          requiredPermissions: [],
          handler: async () => ({ success: true, data: { result: 42 } }),
        }],
      });
      registry.registerPlugin(plugin, []);

      const defs = registry.getToolDefinitions();
      const tool = defs.find(t => t.name === 'com.test.p1.freeTool')!;
      const result = await tool.execute({}, undefined as never, undefined as never);
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ result: 42 });
    });

    it('should deny when only some required permissions are granted', async () => {
      const plugin = makePlugin('com.test.p1', {
        tools: [{
          name: 'multiPermTool',
          description: 'Needs read + write',
          parameters: { type: 'object', properties: {} },
          requiredPermissions: ['read-pieces', 'write-pieces'],
          handler: async () => ({ success: true }),
        }],
      });
      registry.registerPlugin(plugin, ['read-pieces']); // Only read, not write

      const defs = registry.getToolDefinitions();
      const tool = defs.find(t => t.name === 'com.test.p1.multiPermTool')!;
      const result = await tool.execute({}, undefined as never, undefined as never);
      expect(result.success).toBe(false);
      expect(result.error).toContain('write-pieces');
    });
  });

  describe('getToolsByPlugin for nonexistent plugin', () => {
    it('should return empty array', () => {
      expect(registry.getToolsByPlugin('nonexistent')).toHaveLength(0);
    });
  });

  describe('default registry singleton', () => {
    it('should return same instance on repeated calls', () => {
      resetDefaultPluginRegistry();
      const r1 = getDefaultPluginRegistry();
      const r2 = getDefaultPluginRegistry();
      expect(r1).toBe(r2);
    });

    it('should return fresh instance after reset', () => {
      const r1 = getDefaultPluginRegistry();
      resetDefaultPluginRegistry();
      const r2 = getDefaultPluginRegistry();
      expect(r1).not.toBe(r2);
    });
  });
});
