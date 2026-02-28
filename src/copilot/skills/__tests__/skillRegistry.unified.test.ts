/**
 * Tests for Unified Skill Registry.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';

// Reset modules to get fresh singleton
beforeEach(() => {
  vi.resetModules();
});

describe('SkillRegistry (Unified)', () => {
  let SkillRegistry: typeof import('../skillRegistry').SkillRegistry;
  let resetSkillRegistry: typeof import('../skillRegistry').resetSkillRegistry;

  beforeEach(async () => {
    const module = await import('../skillRegistry');
    SkillRegistry = module.SkillRegistry;
    resetSkillRegistry = module.resetSkillRegistry;
  });

  afterEach(async () => {
    await resetSkillRegistry();
  });

  describe('getInstance / initialize', () => {
    it('returns singleton instance', () => {
      const instance1 = SkillRegistry.getInstance();
      const instance2 = SkillRegistry.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('loads core skills on initialize', async () => {
      const registry = SkillRegistry.getInstance();
      await registry.initialize();
      expect(registry.has('openclo:bodice')).toBe(true);
      expect(registry.has('openclo:sleeve')).toBe(true);
      expect(registry.coreCount).toBe(5);
    });
  });

  describe('register / unregister', () => {
    it('registers a community skill', async () => {
      const registry = SkillRegistry.getInstance();
      await registry.initialize();

      const nsid = await registry.registerFromJSON(JSON.stringify({
        schemaVersion: '1.0.0',
        metadata: {
          id: 'test:skill',
          name: 'Test',
          version: '1.0.0',
          author: 'Test',
          description: 'Test',
          tags: [],
          license: 'MIT',
        },
        skill: {
          name: 'test',
          triggers: ['test trigger'],
          description: 'Test',
          methods: [{ name: 'Default', origin: 'US', description: 'Default', formulas: {} }],
          formulas: {},
          easeTable: {},
          constructionSteps: [{ order: 1, instruction: 'Step', toolCalls: [] }],
        },
      }));

      expect(nsid).toBe('test:skill');
      expect(registry.has('test:skill')).toBe(true);
    });

    it('throws when unregistering core skill', async () => {
      const registry = SkillRegistry.getInstance();
      await registry.initialize();
      await expect(registry.unregister('openclo:bodice')).rejects.toThrow('core');
    });
  });

  describe('findByTrigger', () => {
    it('finds skill by trigger phrase', async () => {
      const registry = SkillRegistry.getInstance();
      await registry.initialize();
      const skill = registry.findByTrigger('bodice');
      expect(skill).toBeDefined();
      expect(skill!.nsid).toBe('openclo:bodice');
    });

    it('returns undefined for unknown trigger', async () => {
      const registry = SkillRegistry.getInstance();
      await registry.initialize();
      const skill = registry.findByTrigger('xyznonexistent');
      expect(skill).toBeUndefined();
    });
  });

  describe('events', () => {
    it('emits skill:registered event', async () => {
      const registry = SkillRegistry.getInstance();
      await registry.initialize();

      const handler = vi.fn();
      registry.on('skill:registered', handler);

      await registry.registerFromJSON(JSON.stringify({
        schemaVersion: '1.0.0',
        metadata: { id: 'event:test', name: 'Test', version: '1.0.0', author: 'T', description: 'T', tags: [], license: 'MIT' },
        skill: { name: 'test', triggers: ['evt'], description: 'T', methods: [{ name: 'D', origin: 'US', description: 'D', formulas: {} }], formulas: {}, easeTable: {}, constructionSteps: [{ order: 1, instruction: 'S', toolCalls: [] }] },
      }));

      expect(handler).toHaveBeenCalledWith('event:test', expect.anything());
    });
  });

  describe('enable / disable', () => {
    it('disables and enables a skill', async () => {
      const registry = SkillRegistry.getInstance();
      await registry.initialize();

      await registry.disable('openclo:bodice');
      let skill = registry.get('openclo:bodice');
      expect(skill!.enabled).toBe(false);

      await registry.enable('openclo:bodice');
      skill = registry.get('openclo:bodice');
      expect(skill!.enabled).toBe(true);
    });
  });
});
