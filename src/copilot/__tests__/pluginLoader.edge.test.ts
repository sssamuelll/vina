/**
 * Extended edge-case tests for pluginLoader.
 *
 * Covers: plugin storage, onLoad/onUnload throwing, getLoadedPlugin,
 * semver edge cases, manifest validation edge cases, plugin validation
 * for all asset types.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  validateManifest,
  validatePlugin,
  parseSemver,
  satisfiesSemver,
  loadPluginDirect,
  unloadPlugin,
  getLoadedPlugin,
  getLoadedPlugins,
  isPluginLoaded,
  resetLoadedPlugins,
  readPluginStorage,
  writePluginStorage,
  clearPluginStorage,
  getPluginStorageKey,
  checkPermissions,
} from '../plugins/pluginLoader';
import type { PluginManifest, VinaPlugin, PluginPermission } from '../plugins/types';

// ─── Mock localStorage ──────────────────────────────────────────────────────
const store: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value; },
  removeItem: (key: string) => { delete store[key]; },
  get length() { return Object.keys(store).length; },
  key: (index: number) => Object.keys(store)[index] ?? null,
  clear: () => { for (const key of Object.keys(store)) delete store[key]; },
};
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });

// ─── Helpers ────────────────────────────────────────────────────────────────

function validManifest(overrides?: Partial<PluginManifest>): PluginManifest {
  return {
    id: 'com.test.plugin',
    name: 'Test Plugin',
    version: '1.0.0',
    author: 'Test Author',
    description: 'A test plugin',
    license: 'MIT',
    compatibleWith: '>=0.4.0',
    entryPoint: './index.js',
    permissions: ['read-pieces'],
    ...overrides,
  };
}

function validPlugin(overrides?: Partial<VinaPlugin>): VinaPlugin {
  return {
    id: 'com.test.plugin',
    name: 'Test Plugin',
    version: '1.0.0',
    author: 'Test Author',
    description: 'A test plugin',
    license: 'MIT',
    compatibleWith: '>=0.4.0',
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('parseSemver — edge cases', () => {
  it('should parse semver with pre-release suffix (ignoring suffix)', () => {
    // parseSemver uses regex that matches start of string
    expect(parseSemver('1.2.3-beta.1')).toEqual([1, 2, 3]);
  });

  it('should parse semver with build metadata', () => {
    expect(parseSemver('1.2.3+build.456')).toEqual([1, 2, 3]);
  });

  it('should return null for single number', () => {
    expect(parseSemver('1')).toBeNull();
  });

  it('should return null for two-part version', () => {
    expect(parseSemver('1.2')).toBeNull();
  });

  it('should parse 0.0.0', () => {
    expect(parseSemver('0.0.0')).toEqual([0, 0, 0]);
  });

  it('should return null for negative numbers', () => {
    expect(parseSemver('-1.0.0')).toBeNull();
  });
});

describe('satisfiesSemver — edge cases', () => {
  it('should return false for invalid current version', () => {
    expect(satisfiesSemver('abc', '>=0.4.0')).toBe(false);
  });

  it('should return false for invalid range', () => {
    expect(satisfiesSemver('0.4.0', '>=abc')).toBe(false);
  });

  it('should return false when both are invalid', () => {
    expect(satisfiesSemver('x', 'y')).toBe(false);
  });

  it('should handle >= with spaces', () => {
    expect(satisfiesSemver('0.4.0', '>= 0.4.0')).toBe(true);
  });

  it('should compare major versions correctly', () => {
    expect(satisfiesSemver('2.0.0', '>=1.9.9')).toBe(true);
    expect(satisfiesSemver('0.9.9', '>=1.0.0')).toBe(false);
  });

  it('should compare 0.0.0 against 0.0.0', () => {
    expect(satisfiesSemver('0.0.0', '0.0.0')).toBe(true);
  });

  it('should handle identical versions', () => {
    expect(satisfiesSemver('1.2.3', '1.2.3')).toBe(true);
  });
});

describe('validateManifest — extended edge cases', () => {
  it('should reject permissions that is not an array', () => {
    const manifest = validManifest({ permissions: 'read-pieces' as unknown as PluginPermission[] });
    const result = validateManifest(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('permissions must be an array'))).toBe(true);
  });

  it('should reject all empty required fields', () => {
    const result = validateManifest(validManifest({
      id: '', name: '', version: '', author: '',
      description: '', license: '', compatibleWith: '', entryPoint: '',
    }));
    expect(result.valid).toBe(false);
    // Should have errors for all empty fields
    expect(result.errors.length).toBeGreaterThanOrEqual(7);
  });

  it('should reject id starting with number', () => {
    const result = validateManifest(validManifest({ id: '1bad-id' }));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('lowercase'))).toBe(true);
  });

  it('should reject id with uppercase', () => {
    const result = validateManifest(validManifest({ id: 'Bad.Id' }));
    expect(result.valid).toBe(false);
  });

  it('should accept id with dots and hyphens', () => {
    const result = validateManifest(validManifest({ id: 'com.my-plugin.v2' }));
    expect(result.valid).toBe(true);
  });

  it('should accept empty permissions array', () => {
    const result = validateManifest(validManifest({ permissions: [] }));
    expect(result.valid).toBe(true);
  });

  it('should reject non-string field values', () => {
    const result = validateManifest(validManifest({ name: 42 as unknown as string }));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('name'))).toBe(true);
  });
});

describe('validatePlugin — extended edge cases', () => {
  it('should reject non-array tools', () => {
    const result = validatePlugin(validPlugin({ tools: 'not-an-array' as unknown as VinaPlugin['tools'] }));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('tools must be an array'))).toBe(true);
  });

  it('should reject non-array skills', () => {
    const result = validatePlugin(validPlugin({ skills: {} as unknown as VinaPlugin['skills'] }));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('skills must be an array'))).toBe(true);
  });

  it('should reject non-array fabrics', () => {
    const result = validatePlugin(validPlugin({ fabrics: 'nope' as unknown as VinaPlugin['fabrics'] }));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('fabrics must be an array'))).toBe(true);
  });

  it('should reject non-array templates', () => {
    const result = validatePlugin(validPlugin({ templates: true as unknown as VinaPlugin['templates'] }));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('templates must be an array'))).toBe(true);
  });

  it('should reject onLoad that is not a function', () => {
    const result = validatePlugin(validPlugin({ onLoad: 'not-a-function' as unknown as () => void }));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('onLoad'))).toBe(true);
  });

  it('should reject onUnload that is not a function', () => {
    const result = validatePlugin(validPlugin({ onUnload: 42 as unknown as () => void }));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('onUnload'))).toBe(true);
  });

  it('should validate templates with missing fields', () => {
    const result = validatePlugin(validPlugin({
      templates: [{
        id: '',
        name: '',
        description: '',
        category: '',
        data: {},
      }],
    }));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Template'))).toBe(true);
  });

  it('should validate valid templates', () => {
    const result = validatePlugin(validPlugin({
      templates: [{
        id: 'tpl-1',
        name: 'Template 1',
        description: 'A template',
        category: 'tops',
        data: { pieces: [] },
      }],
    }));
    expect(result.valid).toBe(true);
  });

  it('should validate skills with missing triggers', () => {
    const result = validatePlugin(validPlugin({
      skills: [{
        skill: {
          name: 'bad-skill',
          triggers: [],
          description: 'Missing triggers',
          methods: [{ name: 'M', origin: 'US', description: 'D', formulas: {} }],
          formulas: {},
          easeTable: {},
          constructionSteps: [{ order: 1, instruction: 'S', toolCalls: [] }],
        },
      }],
    }));
    expect(result.valid).toBe(false);
  });

  it('should reject tool with missing requiredPermissions', () => {
    const result = validatePlugin(validPlugin({
      tools: [{
        name: 'tool',
        description: 'A tool',
        parameters: { type: 'object', properties: {} },
        requiredPermissions: 'not-array' as unknown as PluginPermission[],
        handler: async () => ({ success: true }),
      }],
    }));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('requiredPermissions'))).toBe(true);
  });

  it('should reject plugin without author', () => {
    const result = validatePlugin(validPlugin({ author: '' }));
    expect(result.valid).toBe(false);
  });

  it('should reject plugin without description', () => {
    const result = validatePlugin(validPlugin({ description: '' }));
    expect(result.valid).toBe(false);
  });
});

describe('Plugin loading — onLoad/onUnload throwing', () => {
  beforeEach(() => {
    resetLoadedPlugins();
  });

  it('should NOT add plugin to loaded map if onLoad throws', () => {
    const plugin = validPlugin({
      onLoad: () => { throw new Error('onLoad boom'); },
    });
    expect(() => loadPluginDirect(plugin)).toThrow('onLoad boom');
    expect(isPluginLoaded('com.test.plugin')).toBe(false);
    expect(getLoadedPlugins()).toHaveLength(0);
  });

  it('should still remove plugin from map if onUnload throws', () => {
    const plugin = validPlugin({
      onUnload: () => { throw new Error('onUnload boom'); },
    });
    loadPluginDirect(plugin);
    expect(isPluginLoaded('com.test.plugin')).toBe(true);

    // onUnload throws, but plugin should still be removed
    expect(() => unloadPlugin('com.test.plugin')).toThrow('onUnload boom');
    expect(isPluginLoaded('com.test.plugin')).toBe(false);
  });

  it('should reset all plugins even if some onUnload throw', () => {
    const plugin1 = validPlugin({
      id: 'com.test.a',
      name: 'A',
      version: '1.0.0',
      author: 'T',
      description: 'D',
      onUnload: () => { throw new Error('a boom'); },
    });
    const plugin2 = validPlugin({
      id: 'com.test.b',
      name: 'B',
      version: '1.0.0',
      author: 'T',
      description: 'D',
    });
    loadPluginDirect(plugin1);
    loadPluginDirect(plugin2);
    expect(getLoadedPlugins()).toHaveLength(2);

    // Should not throw, and both should be removed
    resetLoadedPlugins();
    expect(getLoadedPlugins()).toHaveLength(0);
  });
});

describe('getLoadedPlugin', () => {
  beforeEach(() => {
    resetLoadedPlugins();
  });

  it('should return plugin by id', () => {
    loadPluginDirect(validPlugin());
    const p = getLoadedPlugin('com.test.plugin');
    expect(p).toBeDefined();
    expect(p!.name).toBe('Test Plugin');
  });

  it('should return undefined for unknown id', () => {
    expect(getLoadedPlugin('nonexistent')).toBeUndefined();
  });
});

describe('Plugin Storage (read/write/clear)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should write via IDB canonical and read via async helper', async () => {
    writePluginStorage('com.test.p1', { key: 'value', count: 42 });
    const { readPluginStorageAsync } = await import('../plugins/pluginLoader');
    // Allow the dynamic import + fire-and-forget storageSet inside writePluginStorage
    // to settle before reading.
    await new Promise(resolve => setTimeout(resolve, 0));
    const data = await readPluginStorageAsync('com.test.p1');
    expect(data).toEqual({ key: 'value', count: 42 });
  });

  it('sync readPluginStorage returns null when legacy LS is empty', () => {
    expect(readPluginStorage('com.test.p1')).toBeNull();
  });

  it('async readPluginStorageAsync returns null when nothing stored', async () => {
    const { readPluginStorageAsync } = await import('../plugins/pluginLoader');
    expect(await readPluginStorageAsync('com.test.p1')).toBeNull();
  });

  it('should clear plugin data', async () => {
    writePluginStorage('com.test.p1', { key: 'value' });
    await new Promise(resolve => setTimeout(resolve, 0));
    clearPluginStorage('com.test.p1');
    await new Promise(resolve => setTimeout(resolve, 0));
    const { readPluginStorageAsync } = await import('../plugins/pluginLoader');
    expect(await readPluginStorageAsync('com.test.p1')).toBeNull();
  });

  it('should handle corrupt localStorage gracefully', () => {
    localStorage.setItem(getPluginStorageKey('com.test.p1'), 'not-json{{{');
    expect(readPluginStorage('com.test.p1')).toBeNull();
  });

  it('should isolate storage between plugins', async () => {
    writePluginStorage('com.test.p1', { a: 1 });
    writePluginStorage('com.test.p2', { b: 2 });
    await new Promise(resolve => setTimeout(resolve, 0));
    const { readPluginStorageAsync } = await import('../plugins/pluginLoader');
    expect(await readPluginStorageAsync('com.test.p1')).toEqual({ a: 1 });
    expect(await readPluginStorageAsync('com.test.p2')).toEqual({ b: 2 });
  });

  it('should overwrite existing data', async () => {
    writePluginStorage('com.test.p1', { version: 1 });
    writePluginStorage('com.test.p1', { version: 2 });
    await new Promise(resolve => setTimeout(resolve, 0));
    const { readPluginStorageAsync } = await import('../plugins/pluginLoader');
    expect(await readPluginStorageAsync('com.test.p1')).toEqual({ version: 2 });
  });
});

describe('checkPermissions — edge cases', () => {
  it('should handle multiple missing permissions', () => {
    const result = checkPermissions(['read-pieces'], ['write-pieces', 'network', 'export']);
    expect(result.allowed).toBe(false);
    expect(result.missing).toHaveLength(3);
    expect(result.missing).toContain('write-pieces');
    expect(result.missing).toContain('network');
    expect(result.missing).toContain('export');
  });

  it('should pass when granted superset of required', () => {
    const result = checkPermissions(
      ['read-pieces', 'write-pieces', 'network', 'storage'],
      ['read-pieces', 'network'],
    );
    expect(result.allowed).toBe(true);
    expect(result.missing).toHaveLength(0);
  });

  it('should handle empty granted with non-empty required', () => {
    const result = checkPermissions([], ['read-pieces']);
    expect(result.allowed).toBe(false);
    expect(result.missing).toEqual(['read-pieces']);
  });
});

describe('Loading same plugin twice', () => {
  beforeEach(() => {
    resetLoadedPlugins();
  });

  it('should throw on second load with same id', () => {
    loadPluginDirect(validPlugin());
    expect(() => loadPluginDirect(validPlugin({ name: 'Different Name' }))).toThrow('already loaded');
  });

  it('should allow re-load after unload', () => {
    loadPluginDirect(validPlugin());
    unloadPlugin('com.test.plugin');
    expect(isPluginLoaded('com.test.plugin')).toBe(false);

    // Should succeed now
    loadPluginDirect(validPlugin());
    expect(isPluginLoaded('com.test.plugin')).toBe(true);
  });
});
