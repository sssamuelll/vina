import { describe, it, expect, beforeEach } from 'vitest';
import {
  validateManifest,
  validatePlugin,
  checkPermissions,
  getPermissionDescriptions,
  parseSemver,
  satisfiesSemver,
  loadPluginDirect,
  unloadPlugin,
  getLoadedPlugins,
  isPluginLoaded,
  resetLoadedPlugins,
  getPluginStorageKey,
} from '../plugins/pluginLoader';
import type { PluginManifest, OpenCloPlugin, PluginPermission } from '../plugins/types';

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

function validPlugin(overrides?: Partial<OpenCloPlugin>): OpenCloPlugin {
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

describe('parseSemver', () => {
  it('should parse valid semver', () => {
    expect(parseSemver('1.2.3')).toEqual([1, 2, 3]);
    expect(parseSemver('0.4.0')).toEqual([0, 4, 0]);
    expect(parseSemver('10.20.30')).toEqual([10, 20, 30]);
  });

  it('should return null for invalid semver', () => {
    expect(parseSemver('')).toBeNull();
    expect(parseSemver('abc')).toBeNull();
    expect(parseSemver('1.2')).toBeNull();
  });
});

describe('satisfiesSemver', () => {
  it('should accept equal version', () => {
    expect(satisfiesSemver('0.4.0', '>=0.4.0')).toBe(true);
  });

  it('should accept higher version', () => {
    expect(satisfiesSemver('1.0.0', '>=0.4.0')).toBe(true);
    expect(satisfiesSemver('0.5.0', '>=0.4.0')).toBe(true);
    expect(satisfiesSemver('0.4.1', '>=0.4.0')).toBe(true);
  });

  it('should reject lower version', () => {
    expect(satisfiesSemver('0.3.0', '>=0.4.0')).toBe(false);
    expect(satisfiesSemver('0.3.9', '>=0.4.0')).toBe(false);
  });

  it('should handle plain version (no >=)', () => {
    expect(satisfiesSemver('0.4.0', '0.4.0')).toBe(true);
    expect(satisfiesSemver('0.3.0', '0.4.0')).toBe(false);
  });
});

describe('validateManifest', () => {
  it('should validate a correct manifest', () => {
    const result = validateManifest(validManifest());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject missing id', () => {
    const result = validateManifest(validManifest({ id: '' }));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('id'))).toBe(true);
  });

  it('should reject invalid id format', () => {
    const result = validateManifest(validManifest({ id: 'UPPERCASE' }));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('lowercase'))).toBe(true);
  });

  it('should reject invalid version', () => {
    const result = validateManifest(validManifest({ version: 'notSemver' }));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('semver'))).toBe(true);
  });

  it('should reject unknown permissions', () => {
    const result = validateManifest(validManifest({
      permissions: ['read-pieces', 'hack-the-planet' as PluginPermission],
    }));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('hack-the-planet'))).toBe(true);
  });

  it('should warn about incompatible version', () => {
    const result = validateManifest(validManifest({ compatibleWith: '>=99.0.0' }));
    expect(result.valid).toBe(true); // warnings, not errors
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('should reject missing required fields', () => {
    const result = validateManifest(validManifest({ name: '', author: '' }));
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });
});

describe('validatePlugin', () => {
  it('should validate a minimal correct plugin', () => {
    const result = validatePlugin(validPlugin());
    expect(result.valid).toBe(true);
  });

  it('should reject plugin without id', () => {
    const result = validatePlugin(validPlugin({ id: '' }));
    expect(result.valid).toBe(false);
  });

  it('should reject plugin with invalid version', () => {
    const result = validatePlugin(validPlugin({ version: 'bad' }));
    expect(result.valid).toBe(false);
  });

  it('should validate plugin tools', () => {
    const result = validatePlugin(validPlugin({
      tools: [{
        name: 'myTool',
        description: 'A tool',
        parameters: { type: 'object', properties: {} },
        requiredPermissions: ['read-pieces'],
        handler: async () => ({ success: true }),
      }],
    }));
    expect(result.valid).toBe(true);
  });

  it('should reject tools without handler', () => {
    const result = validatePlugin(validPlugin({
      tools: [{
        name: 'myTool',
        description: 'A tool',
        parameters: { type: 'object', properties: {} },
        requiredPermissions: [],
        handler: 'not-a-function' as unknown as () => Promise<{ success: boolean }>,
      }],
    }));
    expect(result.valid).toBe(false);
  });

  it('should validate plugin skills', () => {
    const result = validatePlugin(validPlugin({
      skills: [{
        skill: {
          name: 'custom-bodice',
          triggers: ['test-bodice'],
          description: 'A custom bodice skill',
          methods: [{ name: 'Test', origin: 'US', description: 'Test method', formulas: {} }],
          formulas: {},
          easeTable: {},
          constructionSteps: [{ order: 1, instruction: 'Step 1', toolCalls: [] }],
        },
      }],
    }));
    expect(result.valid).toBe(true);
  });

  it('should warn about empty plugin', () => {
    const result = validatePlugin(validPlugin({
      tools: [],
      skills: [],
      fabrics: [],
      templates: [],
    }));
    expect(result.warnings.some(w => w.includes('no tools'))).toBe(true);
  });

  it('should validate fabrics', () => {
    const result = validatePlugin(validPlugin({
      fabrics: [{
        id: 'silk-custom',
        material: {
          name: 'Custom Silk',
          weight: 80,
          stretchStiffness: 0.5,
          bendStiffness: 0.1,
          friction: 0.3,
          thickness: 0.2,
        },
      }],
    }));
    expect(result.valid).toBe(true);
  });

  it('should reject fabrics with invalid material', () => {
    const result = validatePlugin(validPlugin({
      fabrics: [{
        id: 'bad-fabric',
        material: { name: '', weight: -1, stretchStiffness: 0, bendStiffness: 0, friction: 0, thickness: 0 },
      }],
    }));
    expect(result.valid).toBe(false);
  });
});

describe('checkPermissions', () => {
  it('should allow when all permissions granted', () => {
    const result = checkPermissions(['read-pieces', 'write-pieces'], ['read-pieces']);
    expect(result.allowed).toBe(true);
    expect(result.missing).toHaveLength(0);
  });

  it('should deny when permission missing', () => {
    const result = checkPermissions(['read-pieces'], ['write-pieces']);
    expect(result.allowed).toBe(false);
    expect(result.missing).toContain('write-pieces');
  });

  it('should handle empty required', () => {
    const result = checkPermissions([], []);
    expect(result.allowed).toBe(true);
  });
});

describe('getPermissionDescriptions', () => {
  it('should return human-readable descriptions', () => {
    const descs = getPermissionDescriptions(['read-pieces', 'network']);
    expect(descs).toHaveLength(2);
    expect(descs[0]).toContain('Read');
    expect(descs[1]).toContain('HTTP');
  });
});

describe('Plugin loading lifecycle', () => {
  beforeEach(() => {
    resetLoadedPlugins();
  });

  it('should load and retrieve a plugin', () => {
    const plugin = validPlugin();
    loadPluginDirect(plugin);
    expect(isPluginLoaded('com.test.plugin')).toBe(true);
    expect(getLoadedPlugins()).toHaveLength(1);
  });

  it('should throw on duplicate load', () => {
    loadPluginDirect(validPlugin());
    expect(() => loadPluginDirect(validPlugin())).toThrow('already loaded');
  });

  it('should unload a plugin', () => {
    loadPluginDirect(validPlugin());
    unloadPlugin('com.test.plugin');
    expect(isPluginLoaded('com.test.plugin')).toBe(false);
    expect(getLoadedPlugins()).toHaveLength(0);
  });

  it('should call onLoad when loading', () => {
    let loaded = false;
    loadPluginDirect(validPlugin({ onLoad: () => { loaded = true; } }));
    expect(loaded).toBe(true);
  });

  it('should call onUnload when unloading', () => {
    let unloaded = false;
    loadPluginDirect(validPlugin({ onUnload: () => { unloaded = true; } }));
    unloadPlugin('com.test.plugin');
    expect(unloaded).toBe(true);
  });

  it('should silently ignore unloading unknown plugin', () => {
    expect(() => unloadPlugin('nonexistent')).not.toThrow();
  });

  it('should reset all loaded plugins', () => {
    loadPluginDirect(validPlugin({ id: 'com.test.a', name: 'A', version: '1.0.0', author: 'T', description: 'D' }));
    loadPluginDirect(validPlugin({ id: 'com.test.b', name: 'B', version: '1.0.0', author: 'T', description: 'D' }));
    expect(getLoadedPlugins()).toHaveLength(2);
    resetLoadedPlugins();
    expect(getLoadedPlugins()).toHaveLength(0);
  });
});

describe('getPluginStorageKey', () => {
  it('should return namespaced key', () => {
    expect(getPluginStorageKey('com.test.plugin')).toBe('vina_plugins_com.test.plugin');
  });
});
