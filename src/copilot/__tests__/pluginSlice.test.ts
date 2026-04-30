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

function samplePlugin(): PluginInfo {
  return {
    id: 'com.test.plugin',
    name: 'Test Plugin',
    version: '1.0.0',
    author: 'Test',
    description: 'A test plugin',
    enabled: false,
    permissions: ['read-pieces'],
  };
}

describe('pluginSlice', () => {
  it('should return initial state', () => {
    const state = reducer(undefined, { type: 'unknown' });
    expect(state.installedPlugins).toEqual([]);
    expect(state.pluginErrors).toEqual({});
  });

  describe('installPlugin', () => {
    it('should add a plugin', () => {
      const state = reducer(initialState(), installPlugin(samplePlugin()));
      expect(state.installedPlugins).toHaveLength(1);
      expect(state.installedPlugins[0].id).toBe('com.test.plugin');
    });

    it('should not add duplicate plugin', () => {
      let state = reducer(initialState(), installPlugin(samplePlugin()));
      state = reducer(state, installPlugin(samplePlugin()));
      expect(state.installedPlugins).toHaveLength(1);
    });
  });

  describe('removePlugin', () => {
    it('should remove a plugin', () => {
      let state = reducer(initialState(), installPlugin(samplePlugin()));
      state = reducer(state, removePlugin('com.test.plugin'));
      expect(state.installedPlugins).toHaveLength(0);
    });

    it('should also drop the plugin record (no parallel enabled list to clean)', () => {
      let state = reducer(initialState(), installPlugin(samplePlugin()));
      state = reducer(state, enablePlugin('com.test.plugin'));
      state = reducer(state, removePlugin('com.test.plugin'));
      expect(state.installedPlugins.find(p => p.id === 'com.test.plugin')).toBeUndefined();
    });

    it('should clear plugin errors on remove', () => {
      let state = reducer(initialState(), installPlugin(samplePlugin()));
      state = reducer(state, setPluginError({ id: 'com.test.plugin', error: 'oops' }));
      state = reducer(state, removePlugin('com.test.plugin'));
      expect(state.pluginErrors['com.test.plugin']).toBeUndefined();
    });
  });

  describe('enablePlugin', () => {
    it('should set installedPlugins[].enabled = true', () => {
      let state = reducer(initialState(), installPlugin(samplePlugin()));
      state = reducer(state, enablePlugin('com.test.plugin'));
      expect(state.installedPlugins[0].enabled).toBe(true);
    });

    it('should be idempotent', () => {
      let state = reducer(initialState(), installPlugin(samplePlugin()));
      state = reducer(state, enablePlugin('com.test.plugin'));
      state = reducer(state, enablePlugin('com.test.plugin'));
      expect(state.installedPlugins.filter(p => p.id === 'com.test.plugin' && p.enabled)).toHaveLength(1);
    });
  });

  describe('disablePlugin', () => {
    it('should set installedPlugins[].enabled = false', () => {
      let state = reducer(initialState(), installPlugin(samplePlugin()));
      state = reducer(state, enablePlugin('com.test.plugin'));
      state = reducer(state, disablePlugin('com.test.plugin'));
      expect(state.installedPlugins[0].enabled).toBe(false);
    });
  });

  describe('setPluginError / clearPluginError', () => {
    it('should set an error', () => {
      const state = reducer(initialState(), setPluginError({ id: 'com.test.plugin', error: 'Load failed' }));
      expect(state.pluginErrors['com.test.plugin']).toBe('Load failed');
    });

    it('should clear an error', () => {
      let state = reducer(initialState(), setPluginError({ id: 'com.test.plugin', error: 'oops' }));
      state = reducer(state, clearPluginError('com.test.plugin'));
      expect(state.pluginErrors['com.test.plugin']).toBeUndefined();
    });
  });

  describe('setPluginState', () => {
    it('should replace entire state', () => {
      const newState: PluginState = {
        installedPlugins: [{ ...samplePlugin(), enabled: true }],
        pluginErrors: { 'com.test.plugin': 'warning' },
      };
      const state = reducer(initialState(), setPluginState(newState));
      expect(state.installedPlugins).toHaveLength(1);
      expect(state.installedPlugins[0].enabled).toBe(true);
      expect(state.pluginErrors['com.test.plugin']).toBe('warning');
    });
  });
});
