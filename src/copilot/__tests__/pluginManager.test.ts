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
} from '../plugins/pluginManager';
import { resetLoadedPlugins } from '../plugins/pluginLoader';
import { resetDefaultPluginRegistry } from '../plugins/pluginRegistry';
import type { PluginManifest } from '../plugins/types';

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

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Plugin Manager', () => {
  beforeEach(() => {
    resetPluginManager();
    resetLoadedPlugins();
    resetDefaultPluginRegistry();
    localStorage.clear();
  });

  describe('installPluginFromManifest', () => {
    it('should install a plugin from manifest', () => {
      const entry = installPluginFromManifest(validManifest());
      expect(entry.manifest.id).toBe('com.test.plugin');
      expect(entry.enabled).toBe(false);
      expect(entry.sourceUrl).toBe('local');
      expect(entry.installedAt).toBeTruthy();
    });

    it('should persist to localStorage', () => {
      installPluginFromManifest(validManifest());
      const stored = loadInstalledPluginsList();
      expect(stored).toHaveLength(1);
      expect(stored[0].manifest.id).toBe('com.test.plugin');
    });

    it('should reject duplicate installation', () => {
      installPluginFromManifest(validManifest());
      expect(() => installPluginFromManifest(validManifest())).toThrow('already installed');
    });

    it('should reject invalid manifest', () => {
      expect(() => installPluginFromManifest(validManifest({ id: '' }))).toThrow('Invalid');
    });

    it('should allow custom sourceUrl', () => {
      const entry = installPluginFromManifest(validManifest(), 'https://example.com/plugin');
      expect(entry.sourceUrl).toBe('https://example.com/plugin');
    });
  });

  describe('removePlugin', () => {
    it('should remove an installed plugin', () => {
      installPluginFromManifest(validManifest());
      expect(listInstalledPlugins()).toHaveLength(1);
      removePlugin('com.test.plugin');
      expect(listInstalledPlugins()).toHaveLength(0);
    });

    it('should handle removing non-existent plugin gracefully', () => {
      expect(() => removePlugin('nonexistent')).not.toThrow();
    });
  });

  describe('enablePlugin / disablePlugin', () => {
    it('should enable an installed plugin', () => {
      installPluginFromManifest(validManifest());
      enablePlugin('com.test.plugin');
      const plugin = getInstalledPlugin('com.test.plugin');
      expect(plugin?.enabled).toBe(true);
    });

    it('should disable an enabled plugin', () => {
      installPluginFromManifest(validManifest());
      enablePlugin('com.test.plugin');
      disablePlugin('com.test.plugin');
      const plugin = getInstalledPlugin('com.test.plugin');
      expect(plugin?.enabled).toBe(false);
    });

    it('should throw when enabling non-installed plugin', () => {
      expect(() => enablePlugin('nonexistent')).toThrow('not installed');
    });

    it('should throw when disabling non-installed plugin', () => {
      expect(() => disablePlugin('nonexistent')).toThrow('not installed');
    });
  });

  describe('listInstalledPlugins', () => {
    it('should return all installed plugins', () => {
      installPluginFromManifest(validManifest({ id: 'com.test.a' }));
      installPluginFromManifest(validManifest({ id: 'com.test.b' }));
      expect(listInstalledPlugins()).toHaveLength(2);
    });

    it('should return empty array when no plugins', () => {
      expect(listInstalledPlugins()).toHaveLength(0);
    });
  });

  describe('listEnabledPluginIds', () => {
    it('should return only enabled plugin ids', () => {
      installPluginFromManifest(validManifest({ id: 'com.test.a' }));
      installPluginFromManifest(validManifest({ id: 'com.test.b' }));
      enablePlugin('com.test.a');
      const enabled = listEnabledPluginIds();
      expect(enabled).toEqual(['com.test.a']);
    });
  });

  describe('getInstalledPlugin', () => {
    it('should return plugin by id', () => {
      installPluginFromManifest(validManifest());
      const plugin = getInstalledPlugin('com.test.plugin');
      expect(plugin).toBeDefined();
      expect(plugin?.manifest.name).toBe('Test Plugin');
    });

    it('should return undefined for unknown id', () => {
      expect(getInstalledPlugin('nonexistent')).toBeUndefined();
    });
  });

  describe('persistence', () => {
    it('should survive reset and re-read', () => {
      installPluginFromManifest(validManifest());
      enablePlugin('com.test.plugin');

      // Simulate "restart" — reset in-memory state, re-read from localStorage
      const fresh = loadInstalledPluginsList();
      expect(fresh).toHaveLength(1);
      expect(fresh[0].enabled).toBe(true);
    });
  });
});
