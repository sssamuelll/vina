/**
 * Extended edge-case tests for pluginSlice.
 *
 * Covers: multiple install/remove cycles, enable/disable nonexistent plugins,
 * remove nonexistent plugin, clearPluginError for nonexistent error,
 * setPluginState with various shapes.
 */
import { describe, it, expect } from 'vitest';
import reducer, {
  installPlugin,
  removePlugin,
  enablePlugin,
  disablePlugin,
  setPluginError,
  clearPluginError,
  setPluginState,
} from '../../store/pluginSlice';
import type { PluginState, PluginInfo } from '../../store/pluginSlice';

function initialState(): PluginState {
  return {
    installedPlugins: [],
    pluginErrors: {},
  };
}

function makePlugin(id: string, enabled = false): PluginInfo {
  return {
    id,
    name: `Plugin ${id}`,
    version: '1.0.0',
    author: 'Test',
    description: `Description for ${id}`,
    enabled,
    permissions: ['read-pieces'],
  };
}

describe('pluginSlice — edge cases', () => {
  describe('multiple install/remove cycles', () => {
    it('should handle install → remove → install correctly', () => {
      let state = reducer(initialState(), installPlugin(makePlugin('com.test.a')));
      expect(state.installedPlugins).toHaveLength(1);

      state = reducer(state, removePlugin('com.test.a'));
      expect(state.installedPlugins).toHaveLength(0);

      state = reducer(state, installPlugin(makePlugin('com.test.a')));
      expect(state.installedPlugins).toHaveLength(1);
      expect(state.installedPlugins[0].id).toBe('com.test.a');
    });

    it('should handle rapid install/remove for multiple plugins', () => {
      let state = initialState();

      // Install 3 plugins
      state = reducer(state, installPlugin(makePlugin('com.test.a')));
      state = reducer(state, installPlugin(makePlugin('com.test.b')));
      state = reducer(state, installPlugin(makePlugin('com.test.c')));
      expect(state.installedPlugins).toHaveLength(3);

      // Remove middle one
      state = reducer(state, removePlugin('com.test.b'));
      expect(state.installedPlugins).toHaveLength(2);
      expect(state.installedPlugins.map(p => p.id)).toEqual(['com.test.a', 'com.test.c']);

      // Install new one
      state = reducer(state, installPlugin(makePlugin('com.test.d')));
      expect(state.installedPlugins).toHaveLength(3);

      // Remove all
      state = reducer(state, removePlugin('com.test.a'));
      state = reducer(state, removePlugin('com.test.c'));
      state = reducer(state, removePlugin('com.test.d'));
      expect(state.installedPlugins).toHaveLength(0);
    });
  });

  describe('enable/disable nonexistent plugin', () => {
    it('should not crash when enabling a non-installed plugin', () => {
      const state = reducer(initialState(), enablePlugin('nonexistent'));
      // No installed record to flip; state stays empty.
      expect(state.installedPlugins).toHaveLength(0);
    });

    it('should not crash when disabling a non-installed plugin', () => {
      let state = reducer(initialState(), enablePlugin('nonexistent'));
      state = reducer(state, disablePlugin('nonexistent'));
      expect(state.installedPlugins).toHaveLength(0);
    });

    it('should not crash when disabling a plugin that was never installed', () => {
      const state = reducer(initialState(), disablePlugin('nonexistent'));
      expect(state.installedPlugins).toHaveLength(0);
    });
  });

  describe('remove nonexistent plugin', () => {
    it('should not crash when removing a plugin that was never installed', () => {
      let state = reducer(initialState(), installPlugin(makePlugin('com.test.a')));
      state = reducer(state, removePlugin('nonexistent'));
      // Existing plugin should be unaffected
      expect(state.installedPlugins).toHaveLength(1);
      expect(state.installedPlugins[0].id).toBe('com.test.a');
    });
  });

  describe('clearPluginError for nonexistent error', () => {
    it('should not crash when clearing an error that does not exist', () => {
      const state = reducer(initialState(), clearPluginError('nonexistent'));
      expect(state.pluginErrors).toEqual({});
    });

    it('should not affect other errors when clearing nonexistent', () => {
      let state = reducer(initialState(), setPluginError({ id: 'com.test.a', error: 'oops' }));
      state = reducer(state, clearPluginError('com.test.b'));
      expect(state.pluginErrors['com.test.a']).toBe('oops');
    });
  });

  describe('setPluginState — various shapes', () => {
    it('should replace with empty state', () => {
      let state = reducer(initialState(), installPlugin(makePlugin('com.test.a')));
      state = reducer(state, setPluginState(initialState()));
      expect(state.installedPlugins).toHaveLength(0);
      expect(state.pluginErrors).toEqual({});
    });

    it('should replace with complex state', () => {
      const complexState: PluginState = {
        installedPlugins: [
          makePlugin('com.test.a', true),
          makePlugin('com.test.b', false),
          makePlugin('com.test.c', true),
        ],
        pluginErrors: {
          'com.test.b': 'Failed to load',
        },
      };
      const state = reducer(initialState(), setPluginState(complexState));
      expect(state.installedPlugins).toHaveLength(3);
      expect(state.installedPlugins.filter(p => p.enabled)).toHaveLength(2);
      expect(state.pluginErrors['com.test.b']).toBe('Failed to load');
    });
  });

  describe('error handling', () => {
    it('should overwrite existing error for same plugin', () => {
      let state = reducer(initialState(), setPluginError({ id: 'com.test.a', error: 'first' }));
      state = reducer(state, setPluginError({ id: 'com.test.a', error: 'second' }));
      expect(state.pluginErrors['com.test.a']).toBe('second');
    });

    it('should track errors for multiple plugins independently', () => {
      let state = reducer(initialState(), setPluginError({ id: 'com.test.a', error: 'err A' }));
      state = reducer(state, setPluginError({ id: 'com.test.b', error: 'err B' }));
      expect(state.pluginErrors['com.test.a']).toBe('err A');
      expect(state.pluginErrors['com.test.b']).toBe('err B');
    });

    it('should remove error on plugin removal', () => {
      let state = reducer(initialState(), installPlugin(makePlugin('com.test.a')));
      state = reducer(state, setPluginError({ id: 'com.test.a', error: 'oops' }));
      state = reducer(state, removePlugin('com.test.a'));
      expect(state.pluginErrors['com.test.a']).toBeUndefined();
    });
  });

  describe('enable/disable behavior on installed plugin', () => {
    it('should toggle installedPlugins[].enabled', () => {
      let state = reducer(initialState(), installPlugin(makePlugin('com.test.a')));
      state = reducer(state, enablePlugin('com.test.a'));
      expect(state.installedPlugins[0].enabled).toBe(true);

      state = reducer(state, disablePlugin('com.test.a'));
      expect(state.installedPlugins[0].enabled).toBe(false);
    });

    it('should handle enable → remove → re-install as disabled', () => {
      let state = reducer(initialState(), installPlugin(makePlugin('com.test.a')));
      state = reducer(state, enablePlugin('com.test.a'));
      state = reducer(state, removePlugin('com.test.a'));

      // Re-install — should not be enabled
      state = reducer(state, installPlugin(makePlugin('com.test.a')));
      expect(state.installedPlugins[0].enabled).toBe(false);
    });
  });
});
