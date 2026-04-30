/**
 * Plugin Redux Slice — state management for the plugin system.
 *
 * Tracks installed plugins, enabled status, and error states.
 * Syncs with localStorage via the plugin manager for persistence.
 *
 * @module store/pluginSlice
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit';

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Summary info about an installed plugin (stored in Redux state).
 */
export interface PluginInfo {
  /** Unique plugin id */
  id: string;
  /** Display name */
  name: string;
  /** Semver version */
  version: string;
  /** Author name */
  author: string;
  /** Description */
  description: string;
  /** Whether the plugin is enabled */
  enabled: boolean;
  /** Permissions granted to this plugin */
  permissions: string[];
}

/**
 * Plugin slice state shape.
 *
 * The set of enabled plugin ids is derived from `installedPlugins.filter(p => p.enabled)`
 * rather than stored as a parallel array — keeping two sources of truth in sync was
 * a bug surface (BUG-13).
 */
export interface PluginState {
  /** All installed plugins */
  installedPlugins: PluginInfo[];
  /** Error messages keyed by plugin id */
  pluginErrors: Record<string, string>;
}

// ─── Initial State ──────────────────────────────────────────────────────────

const initialState: PluginState = {
  installedPlugins: [],
  pluginErrors: {},
};

// ─── Slice ──────────────────────────────────────────────────────────────────

const pluginSlice = createSlice({
  name: 'plugins',
  initialState,
  reducers: {
    /**
     * Add a newly installed plugin to the state.
     */
    installPlugin(state, action: PayloadAction<PluginInfo>) {
      const existing = state.installedPlugins.find(p => p.id === action.payload.id);
      if (!existing) {
        state.installedPlugins.push(action.payload);
      }
    },

    /**
     * Remove a plugin from the state.
     */
    removePlugin(state, action: PayloadAction<string>) {
      state.installedPlugins = state.installedPlugins.filter(p => p.id !== action.payload);
      delete state.pluginErrors[action.payload];
    },

    /**
     * Enable a plugin.
     */
    enablePlugin(state, action: PayloadAction<string>) {
      const plugin = state.installedPlugins.find(p => p.id === action.payload);
      if (plugin) {
        plugin.enabled = true;
      }
    },

    /**
     * Disable a plugin.
     */
    disablePlugin(state, action: PayloadAction<string>) {
      const plugin = state.installedPlugins.find(p => p.id === action.payload);
      if (plugin) {
        plugin.enabled = false;
      }
    },

    /**
     * Set an error message for a plugin.
     */
    setPluginError(state, action: PayloadAction<{ id: string; error: string }>) {
      state.pluginErrors[action.payload.id] = action.payload.error;
    },

    /**
     * Clear a plugin's error message.
     */
    clearPluginError(state, action: PayloadAction<string>) {
      delete state.pluginErrors[action.payload];
    },

    /**
     * Replace all plugin state (for loading from localStorage).
     */
    setPluginState(state, action: PayloadAction<PluginState>) {
      state.installedPlugins = action.payload.installedPlugins;
      state.pluginErrors = action.payload.pluginErrors;
    },
  },
});

export const {
  installPlugin,
  removePlugin,
  enablePlugin,
  disablePlugin,
  setPluginError,
  clearPluginError,
  setPluginState,
} = pluginSlice.actions;

export default pluginSlice.reducer;
