/**
 * Plugin Manager — high-level plugin lifecycle management.
 *
 * Handles installing plugins from URLs, enabling/disabling plugins,
 * removing plugins, and persisting the installed plugins list in localStorage.
 *
 * @module plugins/pluginManager
 */

import type { InstalledPlugin, PluginManifest, OpenCloPlugin } from './types';
import {
  loadPlugin,
  loadPluginDirect,
  unloadPlugin,
  isPluginLoaded,
  clearPluginStorage,
  validateManifest,
} from './pluginLoader';
import { getDefaultPluginRegistry } from './pluginRegistry';

/** localStorage key for the installed plugins list */
const INSTALLED_PLUGINS_KEY = 'openclo_installed_plugins';

// ─── Persistence ────────────────────────────────────────────────────────────

/**
 * Load the installed plugins list from localStorage.
 *
 * @returns Array of InstalledPlugin entries
 */
export function loadInstalledPluginsList(): InstalledPlugin[] {
  try {
    const raw = localStorage.getItem(INSTALLED_PLUGINS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as InstalledPlugin[];
  } catch {
    return [];
  }
}

/**
 * Save the installed plugins list to localStorage.
 *
 * @param plugins - Array of InstalledPlugin entries to persist
 */
export function saveInstalledPluginsList(plugins: InstalledPlugin[]): void {
  localStorage.setItem(INSTALLED_PLUGINS_KEY, JSON.stringify(plugins));
}

// ─── Install / Remove ───────────────────────────────────────────────────────

/**
 * Install a plugin from a URL.
 *
 * Fetches the plugin manifest from `${url}/manifest.json`, validates it,
 * adds it to the installed list, and optionally loads it immediately.
 *
 * @param url - Base URL where the plugin is hosted
 * @returns The installed plugin metadata
 * @throws Error if the manifest cannot be fetched or is invalid
 */
export async function installPlugin(url: string): Promise<InstalledPlugin> {
  // Fetch manifest
  const manifestUrl = url.endsWith('/') ? `${url}manifest.json` : `${url}/manifest.json`;
  let manifest: PluginManifest;

  try {
    const response = await fetch(manifestUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    manifest = await response.json() as PluginManifest;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to fetch plugin manifest from "${manifestUrl}": ${msg}`);
  }

  // Validate manifest
  const validation = validateManifest(manifest);
  if (!validation.valid) {
    throw new Error(`Invalid plugin manifest: ${validation.errors.join('; ')}`);
  }

  // Check for duplicate
  const installed = loadInstalledPluginsList();
  if (installed.some(p => p.manifest.id === manifest.id)) {
    throw new Error(`Plugin "${manifest.id}" is already installed`);
  }

  // Add to installed list
  const entry: InstalledPlugin = {
    manifest,
    enabled: false,
    sourceUrl: url,
    installedAt: new Date().toISOString(),
  };
  installed.push(entry);
  saveInstalledPluginsList(installed);

  return entry;
}

/**
 * Install a plugin directly from a manifest (without network fetch).
 *
 * Useful for local/bundled plugins and testing.
 *
 * @param manifest - The plugin manifest
 * @param sourceUrl - URL for reference (default: "local")
 * @returns The installed plugin metadata
 * @throws Error if manifest is invalid or plugin is already installed
 */
export function installPluginFromManifest(
  manifest: PluginManifest,
  sourceUrl: string = 'local',
): InstalledPlugin {
  const validation = validateManifest(manifest);
  if (!validation.valid) {
    throw new Error(`Invalid plugin manifest: ${validation.errors.join('; ')}`);
  }

  const installed = loadInstalledPluginsList();
  if (installed.some(p => p.manifest.id === manifest.id)) {
    throw new Error(`Plugin "${manifest.id}" is already installed`);
  }

  const entry: InstalledPlugin = {
    manifest,
    enabled: false,
    sourceUrl,
    installedAt: new Date().toISOString(),
  };
  installed.push(entry);
  saveInstalledPluginsList(installed);

  return entry;
}

/**
 * Remove an installed plugin.
 *
 * Unloads the plugin if loaded, unregisters its assets from the plugin
 * registry, removes it from the installed list, and clears its localStorage.
 *
 * @param pluginId - The plugin id to remove
 */
export function removePlugin(pluginId: string): void {
  // Unload if loaded
  if (isPluginLoaded(pluginId)) {
    unloadPlugin(pluginId);
  }

  // Unregister from plugin registry
  getDefaultPluginRegistry().unregisterPlugin(pluginId);

  // Remove from installed list
  const installed = loadInstalledPluginsList();
  const filtered = installed.filter(p => p.manifest.id !== pluginId);
  saveInstalledPluginsList(filtered);

  // Clear plugin storage
  clearPluginStorage(pluginId);
}

// ─── Enable / Disable ───────────────────────────────────────────────────────

/**
 * Enable an installed plugin.
 *
 * Sets the enabled flag in the installed list. Does NOT load the plugin
 * (loading happens at startup or explicitly).
 *
 * @param pluginId - The plugin id to enable
 * @throws Error if plugin is not installed
 */
export function enablePlugin(pluginId: string): void {
  const installed = loadInstalledPluginsList();
  const entry = installed.find(p => p.manifest.id === pluginId);
  if (!entry) {
    throw new Error(`Plugin "${pluginId}" is not installed`);
  }
  entry.enabled = true;
  saveInstalledPluginsList(installed);
}

/**
 * Disable an installed plugin.
 *
 * Sets the enabled flag to false and unloads/unregisters the plugin
 * if it's currently loaded.
 *
 * @param pluginId - The plugin id to disable
 * @throws Error if plugin is not installed
 */
export function disablePlugin(pluginId: string): void {
  const installed = loadInstalledPluginsList();
  const entry = installed.find(p => p.manifest.id === pluginId);
  if (!entry) {
    throw new Error(`Plugin "${pluginId}" is not installed`);
  }
  entry.enabled = false;
  saveInstalledPluginsList(installed);

  // Unload and unregister
  if (isPluginLoaded(pluginId)) {
    unloadPlugin(pluginId);
  }
  getDefaultPluginRegistry().unregisterPlugin(pluginId);
}

// ─── Queries ────────────────────────────────────────────────────────────────

/**
 * List all installed plugins.
 *
 * @returns Array of InstalledPlugin entries
 */
export function listInstalledPlugins(): InstalledPlugin[] {
  return loadInstalledPluginsList();
}

/**
 * Get an installed plugin's metadata by id.
 *
 * @param pluginId - The plugin id
 * @returns InstalledPlugin or undefined if not found
 */
export function getInstalledPlugin(pluginId: string): InstalledPlugin | undefined {
  return loadInstalledPluginsList().find(p => p.manifest.id === pluginId);
}

/**
 * List all enabled plugin ids.
 *
 * @returns Array of plugin id strings
 */
export function listEnabledPluginIds(): string[] {
  return loadInstalledPluginsList()
    .filter(p => p.enabled)
    .map(p => p.manifest.id);
}

// ─── Startup Loading ────────────────────────────────────────────────────────

/**
 * Load and register all enabled plugins at application startup.
 *
 * Iterates through the installed plugins list, loads each enabled plugin
 * via dynamic import, and registers its assets in the plugin registry.
 *
 * @returns Object with arrays of successfully loaded and failed plugin ids
 */
export async function loadEnabledPlugins(): Promise<{
  loaded: string[];
  failed: Array<{ id: string; error: string }>;
}> {
  const installed = loadInstalledPluginsList();
  const enabled = installed.filter(p => p.enabled);
  const loaded: string[] = [];
  const failed: Array<{ id: string; error: string }> = [];
  const registry = getDefaultPluginRegistry();

  for (const entry of enabled) {
    try {
      const plugin = await loadPlugin(entry.manifest);
      registry.registerPlugin(plugin, entry.manifest.permissions);
      loaded.push(entry.manifest.id);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      failed.push({ id: entry.manifest.id, error: msg });
    }
  }

  return { loaded, failed };
}

/**
 * Load and register a single plugin directly (bypasses network).
 *
 * @param plugin - The pre-constructed OpenCloPlugin
 * @param permissions - Permissions to grant
 */
export function loadAndRegisterPlugin(
  plugin: OpenCloPlugin,
  permissions: readonly string[],
): void {
  loadPluginDirect(plugin);
  getDefaultPluginRegistry().registerPlugin(
    plugin,
    permissions as import('./types').PluginPermission[],
  );
}

/**
 * Reset all plugin manager state (for testing).
 */
export function resetPluginManager(): void {
  localStorage.removeItem(INSTALLED_PLUGINS_KEY);
}
