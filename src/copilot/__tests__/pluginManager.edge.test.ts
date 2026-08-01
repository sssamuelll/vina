/**
 * Extended edge-case tests for pluginManager.
 *
 * Covers: enable/disable idempotency, localStorage corruption recovery,
 * remove currently-enabled plugin, loadAndRegisterPlugin,
 * multiple install/remove cycles.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  installPluginFromManifest,
  removePlugin,
  enablePlugin,
  disablePlugin,
  listInstalledPlugins,
  getInstalledPlugin,
  listEnabledPluginIds,
  loadInstalledPluginsList,
  resetPluginManager,
  loadAndRegisterPlugin,
  _resetInstalledPluginsCacheForTests,
} from '../plugins/pluginManager';
import {
  resetLoadedPlugins,
  isPluginLoaded,
} from '../plugins/pluginLoader';
import {
  resetDefaultPluginRegistry,
  getDefaultPluginRegistry,
} from '../plugins/pluginRegistry';
import type { PluginManifest, OpenCloPlugin } from '../plugins/types';

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

describe('Plugin Manager — edge cases', () => {
  beforeEach(() => {
    resetPluginManager();
    resetLoadedPlugins();
    resetDefaultPluginRegistry();
    localStorage.clear();
    _resetInstalledPluginsCacheForTests();
  });

  describe('enable already-enabled plugin', () => {
    it('should be idempotent — enabling twice should not error', () => {
      installPluginFromManifest(validManifest());
      enablePlugin('com.test.plugin');
      expect(getInstalledPlugin('com.test.plugin')?.enabled).toBe(true);

      // Enable again — should not throw
      expect(() => enablePlugin('com.test.plugin')).not.toThrow();
      expect(getInstalledPlugin('com.test.plugin')?.enabled).toBe(true);
    });
  });

  describe('disable already-disabled plugin', () => {
    it('should be idempotent — disabling twice should not error', () => {
      installPluginFromManifest(validManifest());
      // Plugin starts disabled
      expect(getInstalledPlugin('com.test.plugin')?.enabled).toBe(false);

      // Disable again
      expect(() => disablePlugin('com.test.plugin')).not.toThrow();
      expect(getInstalledPlugin('com.test.plugin')?.enabled).toBe(false);
    });
  });

  describe('remove currently-enabled plugin', () => {
    it('should remove and clean up an enabled plugin', () => {
      installPluginFromManifest(validManifest());
      enablePlugin('com.test.plugin');
      expect(listEnabledPluginIds()).toContain('com.test.plugin');

      removePlugin('com.test.plugin');
      expect(listInstalledPlugins()).toHaveLength(0);
      expect(listEnabledPluginIds()).toHaveLength(0);
    });
  });

  describe('localStorage corruption recovery', () => {
    it('should return empty array when localStorage has invalid JSON', () => {
      localStorage.setItem('vina_installed_plugins', 'not-valid-json{{{');
      const list = loadInstalledPluginsList();
      expect(list).toEqual([]);
    });

    it('should return empty array when localStorage has non-array JSON', () => {
      localStorage.setItem('vina_installed_plugins', '{"object": true}');
      const list = loadInstalledPluginsList();
      expect(list).toEqual([]);
    });

    it('should return empty array when localStorage has null', () => {
      localStorage.setItem('vina_installed_plugins', 'null');
      const list = loadInstalledPluginsList();
      expect(list).toEqual([]);
    });
  });

  describe('loadAndRegisterPlugin', () => {
    it('should load and register a plugin directly', () => {
      const plugin = validPlugin({
        tools: [{
          name: 'myTool',
          description: 'A tool',
          parameters: { type: 'object', properties: {} },
          requiredPermissions: ['read-pieces'],
          handler: async () => ({ success: true }),
        }],
      });

      loadAndRegisterPlugin(plugin, ['read-pieces']);

      expect(isPluginLoaded('com.test.plugin')).toBe(true);
      const registry = getDefaultPluginRegistry();
      expect(registry.hasTool('com.test.plugin.myTool')).toBe(true);
    });

    it('should throw for invalid plugin', () => {
      const badPlugin = validPlugin({ id: '', name: '' });
      expect(() => loadAndRegisterPlugin(badPlugin, [])).toThrow();
    });
  });

  describe('multiple install/remove cycles', () => {
    it('should handle install → remove → install correctly', () => {
      installPluginFromManifest(validManifest());
      expect(listInstalledPlugins()).toHaveLength(1);

      removePlugin('com.test.plugin');
      expect(listInstalledPlugins()).toHaveLength(0);

      // Re-install
      installPluginFromManifest(validManifest());
      expect(listInstalledPlugins()).toHaveLength(1);
      expect(getInstalledPlugin('com.test.plugin')).toBeDefined();
    });

    it('should handle multiple plugins install/remove interleaved', () => {
      installPluginFromManifest(validManifest({ id: 'com.test.a' }));
      installPluginFromManifest(validManifest({ id: 'com.test.b' }));
      installPluginFromManifest(validManifest({ id: 'com.test.c' }));
      expect(listInstalledPlugins()).toHaveLength(3);

      removePlugin('com.test.b');
      expect(listInstalledPlugins()).toHaveLength(2);
      expect(getInstalledPlugin('com.test.a')).toBeDefined();
      expect(getInstalledPlugin('com.test.b')).toBeUndefined();
      expect(getInstalledPlugin('com.test.c')).toBeDefined();

      // Install new plugin in the gap
      installPluginFromManifest(validManifest({ id: 'com.test.d' }));
      expect(listInstalledPlugins()).toHaveLength(3);
    });
  });

  describe('install with same ID as existing (update flow)', () => {
    it('should reject duplicate install — must remove first', () => {
      installPluginFromManifest(validManifest());
      expect(() => installPluginFromManifest(validManifest())).toThrow('already installed');
    });

    it('should succeed after remove + reinstall (simulated update)', () => {
      installPluginFromManifest(validManifest({ id: 'com.test.p1' }));
      removePlugin('com.test.p1');
      const entry = installPluginFromManifest(validManifest({ id: 'com.test.p1', version: '2.0.0' }));
      expect(entry.manifest.version).toBe('2.0.0');
    });
  });

  describe('enable/disable persistence across reads', () => {
    it('should persist enable state to localStorage', () => {
      installPluginFromManifest(validManifest());
      enablePlugin('com.test.plugin');

      // Read fresh from localStorage
      const fresh = loadInstalledPluginsList();
      expect(fresh[0].enabled).toBe(true);
    });

    it('should persist disable state to localStorage', () => {
      installPluginFromManifest(validManifest());
      enablePlugin('com.test.plugin');
      disablePlugin('com.test.plugin');

      const fresh = loadInstalledPluginsList();
      expect(fresh[0].enabled).toBe(false);
    });
  });
});
