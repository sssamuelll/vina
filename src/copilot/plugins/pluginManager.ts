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
import { PluginHost } from './sandbox/PluginHost';
import type { AppDispatch, RootState } from '../../store';
import type { ToolRegistry } from '../action/tools/registry';

// ─── PluginHost Singleton ────────────────────────────────────────────────────

/** Lazy-initialized singleton PluginHost instance */
let _pluginHost: PluginHost | null = null;

/**
 * Initialize the PluginHost singleton with Redux and registry dependencies.
 *
 * Must be called once during application startup (e.g. in the store setup or
 * the root component) before `loadEnabledPlugins()` is invoked. Subsequent
 * calls are no-ops — the first set of dependencies wins.
 *
 * @param dispatch   - Redux dispatch function
 * @param getState   - Function returning the current Redux state
 * @param registry   - Core ToolRegistry to register plugin tools into
 */
export function initPluginHost(
  dispatch: AppDispatch,
  getState: () => RootState,
  registry: ToolRegistry,
): void {
  if (_pluginHost) return; // already initialized — no-op
  _pluginHost = new PluginHost(dispatch, getState, registry);
}

/**
 * Get the current PluginHost singleton, or null if not yet initialized.
 */
export function getPluginHost(): PluginHost | null {
  return _pluginHost;
}

/**
 * Reset the PluginHost singleton (for testing).
 */
export function resetPluginHost(): void {
  _pluginHost = null;
}

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
  import("../../utils/storage").then(({ storageSet }) => { storageSet("plugins", "installed", plugins); }).catch(() => {}); try { localStorage.setItem(INSTALLED_PLUGINS_KEY, JSON.stringify(plugins)); } catch { /* ignore */ }
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
 * When a PluginHost has been initialized via `initPluginHost()`, each enabled
 * plugin is loaded through the sandboxed Worker path: the plugin source is
 * fetched as text and passed to `PluginHost.loadPlugin()`. This ensures the
 * plugin code runs in a sandboxed Worker with enforced permissions.
 *
 * If no PluginHost is available (legacy / test path), falls back to the old
 * `loadPlugin` → `pluginRegistry.registerPlugin` flow via dynamic import.
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

  const host = _pluginHost;

  for (const entry of enabled) {
    const { manifest } = entry;

    if (host) {
      // ── Sandboxed path via PluginHost ───────────────────────────────────
      // Fetch the plugin source code as text so it can be sent to the Worker.
      // The entryPoint is expected to be an absolute or relative URL resolvable
      // from the application origin.
      try {
        let pluginCode: string;
        try {
          const response = await fetch(manifest.entryPoint);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          pluginCode = await response.text();
        } catch (fetchErr: unknown) {
          const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
          throw new Error(`Failed to fetch plugin source from "${manifest.entryPoint}": ${msg}`);
        }

        await host.loadPlugin(manifest, pluginCode);
        loaded.push(manifest.id);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        failed.push({ id: manifest.id, error: msg });
      }
    } else {
      // ── Legacy path (no sandbox) ─────────────────────────────────────────
      // Kept for backward compatibility when PluginHost is not initialized.
      // Deprecated: callers should call initPluginHost() at startup.
      const registry = getDefaultPluginRegistry();
      try {
        const plugin = await loadPlugin(manifest);
        registry.registerPlugin(plugin, manifest.permissions);
        loaded.push(manifest.id);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        failed.push({ id: manifest.id, error: msg });
      }
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
 *
 * Also resets the PluginHost singleton so tests can re-initialize it cleanly.
 */
export function resetPluginManager(): void {
  import("../../utils/storage").then(({ storageDel }) => { storageDel("plugins", "installed"); }).catch(() => {}); try { localStorage.removeItem(INSTALLED_PLUGINS_KEY); } catch { /* ignore */ }
  _pluginHost = null;
}
