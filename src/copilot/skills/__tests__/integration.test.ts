/**
 * Integration tests for SkillRegistry lifecycle.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';

describe('SkillRegistry Integration', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('full lifecycle: register, find, disable, enable, unregister', async () => {
    const { SkillRegistry, resetSkillRegistry } = await import('../skillRegistry');
    const registry = SkillRegistry.getInstance();
    await registry.initialize();

    // Register
    const nsid = await registry.registerFromJSON(JSON.stringify({
      schemaVersion: '1.0.0',
      metadata: { id: 'integration:test', name: 'Test', version: '1.0.0', author: 'Test', description: 'Test', tags: [], license: 'MIT' },
      skill: { name: 'test', triggers: ['integration test'], description: 'Test', methods: [{ name: 'D', origin: 'US', description: 'D', formulas: {} }], formulas: {}, easeTable: {}, constructionSteps: [{ order: 1, instruction: 'S', toolCalls: [] }] },
    }));

    expect(registry.has(nsid)).toBe(true);

    // Find by trigger
    const found = registry.findByTrigger('integration test');
    expect(found?.nsid).toBe(nsid);

    // Disable
    await registry.disable(nsid);
    expect(registry.get(nsid)?.enabled).toBe(false);

    // Enable
    await registry.enable(nsid);
    expect(registry.get(nsid)?.enabled).toBe(true);

    // Unregister
    await registry.unregister(nsid);
    expect(registry.has(nsid)).toBe(false);

    await resetSkillRegistry();
  });

  it('persists skills across registry resets', async () => {
    // First session
    let mod = await import('../skillRegistry');
    let registry = mod.SkillRegistry.getInstance();
    await registry.initialize();

    await registry.registerFromJSON(JSON.stringify({
      schemaVersion: '1.0.0',
      metadata: { id: 'persist:test', name: 'Persist', version: '1.0.0', author: 'Test', description: 'Test', tags: [], license: 'MIT' },
      skill: { name: 'persist', triggers: ['persist'], description: 'Test', methods: [{ name: 'D', origin: 'US', description: 'D', formulas: {} }], formulas: {}, easeTable: {}, constructionSteps: [{ order: 1, instruction: 'S', toolCalls: [] }] },
    }));

    await mod.resetSkillRegistry();

    // Second session
    vi.resetModules();
    mod = await import('../skillRegistry');
    registry = mod.SkillRegistry.getInstance();
    await registry.initialize();

    expect(registry.has('persist:test')).toBe(true);

    await mod.resetSkillRegistry();
  });
});
