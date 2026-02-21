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
    enabledPlugins: [],
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
    expect(state.enabledPlugins).toEqual([]);
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

    it('should remove from enabledPlugins too', () => {
      let state = reducer(initialState(), installPlugin(samplePlugin()));
      state = reducer(state, enablePlugin('com.test.plugin'));
      state = reducer(state, removePlugin('com.test.plugin'));
      expect(state.enabledPlugins).not.toContain('com.test.plugin');
    });

    it('should clear plugin errors on remove', () => {
      let state = reducer(initialState(), installPlugin(samplePlugin()));
      state = reducer(state, setPluginError({ id: 'com.test.plugin', error: 'oops' }));
      state = reducer(state, removePlugin('com.test.plugin'));
      expect(state.pluginErrors['com.test.plugin']).toBeUndefined();
    });
  });

  describe('enablePlugin', () => {
    it('should add to enabledPlugins', () => {
      let state = reducer(initialState(), installPlugin(samplePlugin()));
      state = reducer(state, enablePlugin('com.test.plugin'));
      expect(state.enabledPlugins).toContain('com.test.plugin');
      expect(state.installedPlugins[0].enabled).toBe(true);
    });

    it('should not duplicate in enabledPlugins', () => {
      let state = reducer(initialState(), installPlugin(samplePlugin()));
      state = reducer(state, enablePlugin('com.test.plugin'));
      state = reducer(state, enablePlugin('com.test.plugin'));
      expect(state.enabledPlugins.filter(id => id === 'com.test.plugin')).toHaveLength(1);
    });
  });

  describe('disablePlugin', () => {
    it('should remove from enabledPlugins', () => {
      let state = reducer(initialState(), installPlugin(samplePlugin()));
      state = reducer(state, enablePlugin('com.test.plugin'));
      state = reducer(state, disablePlugin('com.test.plugin'));
      expect(state.enabledPlugins).not.toContain('com.test.plugin');
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
        installedPlugins: [samplePlugin()],
        enabledPlugins: ['com.test.plugin'],
        pluginErrors: { 'com.test.plugin': 'warning' },
      };
      const state = reducer(initialState(), setPluginState(newState));
      expect(state.installedPlugins).toHaveLength(1);
      expect(state.enabledPlugins).toHaveLength(1);
      expect(state.pluginErrors['com.test.plugin']).toBe('warning');
    });
  });
});
