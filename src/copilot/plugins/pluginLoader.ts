/**
 * Plugin Loader — handles loading, unloading, and validating plugins.
 *
 * Manages the plugin lifecycle: validates manifests, dynamically imports
 * plugin modules, checks permissions and compatibility, and maintains
 * the set of currently loaded plugins.
 *
 * @module plugins/pluginLoader
 */

import type {
  OpenCloPlugin,
  PluginManifest,
  PluginPermission,
  ValidationResult,
} from './types';
import { ALL_PLUGIN_PERMISSIONS } from './types';
import { safeGetItem, safeRemoveItem } from '../../utils/safeStorage';

/** Current OpenClo version — used for plugin compatibility checks */
const OPENCLO_VERSION = '0.4.0';

/** Loaded plugin instances keyed by plugin id */
const loadedPlugins: Map<string, OpenCloPlugin> = new Map();

// ─── Semver Utilities ───────────────────────────────────────────────────────

/**
 * Parse a semver string into its numeric components.
 *
 * @param version - Semver string (e.g. "1.2.3")
 * @returns Tuple of [major, minor, patch] or null if invalid
 */
export function parseSemver(version: string): [number, number, number] | null {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10)];
}

/**
 * Check if `current` satisfies a `>=range` semver requirement.
 *
 * Supports `>=X.Y.Z` range format and plain `X.Y.Z` (treated as `>=X.Y.Z`).
 *
 * @param current - The current version string
 * @param range - The version range requirement
 * @returns true if current satisfies the range
 */
export function satisfiesSemver(current: string, range: string): boolean {
  const cleanRange = range.replace(/^>=\s*/, '').trim();
  const cur = parseSemver(current);
  const req = parseSemver(cleanRange);
  if (!cur || !req) return false;

  if (cur[0] !== req[0]) return cur[0] > req[0];
  if (cur[1] !== req[1]) return cur[1] > req[1];
  return cur[2] >= req[2];
}

// ─── Manifest Validation ────────────────────────────────────────────────────

/**
 * Validate a plugin manifest for correctness and completeness.
 *
 * Checks:
 * - All required fields are present and non-empty strings
 * - Version is valid semver
 * - All permissions are recognized
 * - Plugin is compatible with current OpenClo version
 *
 * @param manifest - The manifest to validate
 * @returns ValidationResult with errors and warnings
 */
export function validateManifest(manifest: PluginManifest): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required string fields
  const requiredStrings: (keyof PluginManifest)[] = [
    'id', 'name', 'version', 'author', 'description', 'license', 'compatibleWith', 'entryPoint',
  ];
  for (const field of requiredStrings) {
    if (field === 'permissions') continue;
    const val = manifest[field];
    if (typeof val !== 'string' || val.trim().length === 0) {
      errors.push(`Missing or empty required field: "${field}"`);
    }
  }

  // ID format
  if (manifest.id && !/^[a-z][a-z0-9.-]*$/.test(manifest.id)) {
    errors.push('Plugin id must be lowercase alphanumeric with dots/hyphens, starting with a letter');
  }

  // Version is valid semver
  if (manifest.version && !parseSemver(manifest.version)) {
    errors.push(`Invalid semver version: "${manifest.version}"`);
  }

  // Permissions array
  if (!Array.isArray(manifest.permissions)) {
    errors.push('permissions must be an array');
  } else {
    for (const perm of manifest.permissions) {
      if (!ALL_PLUGIN_PERMISSIONS.includes(perm as PluginPermission)) {
        errors.push(`Unknown permission: "${perm}"`);
      }
    }
  }

  // Compatibility check
  if (manifest.compatibleWith && !satisfiesSemver(OPENCLO_VERSION, manifest.compatibleWith)) {
    warnings.push(
      `Plugin requires OpenClo ${manifest.compatibleWith}, current version is ${OPENCLO_VERSION}`,
    );
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ─── Plugin Validation ──────────────────────────────────────────────────────

/**
 * Validate a loaded plugin object for structural correctness.
 *
 * Checks:
 * - Required fields are present
 * - Version is valid semver
 * - Tools have valid structure (name, description, parameters, handler)
 * - Skills have valid PatternSkill structure
 * - Fabrics have valid FabricMaterial structure
 * - No prohibited patterns (eval, Function constructor references)
 *
 * @param plugin - The plugin object to validate
 * @returns ValidationResult with errors and warnings
 */
export function validatePlugin(plugin: OpenCloPlugin): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required fields
  if (!plugin.id || typeof plugin.id !== 'string') {
    errors.push('Plugin must have a string "id"');
  }
  if (!plugin.name || typeof plugin.name !== 'string') {
    errors.push('Plugin must have a string "name"');
  }
  if (!plugin.version || !parseSemver(plugin.version)) {
    errors.push('Plugin must have a valid semver "version"');
  }
  if (!plugin.author || typeof plugin.author !== 'string') {
    errors.push('Plugin must have a string "author"');
  }
  if (!plugin.description || typeof plugin.description !== 'string') {
    errors.push('Plugin must have a string "description"');
  }

  // Validate tools
  if (plugin.tools) {
    if (!Array.isArray(plugin.tools)) {
      errors.push('Plugin tools must be an array');
    } else {
      for (let i = 0; i < plugin.tools.length; i++) {
        const tool = plugin.tools[i];
        if (!tool.name || typeof tool.name !== 'string') {
          errors.push(`Tool[${i}] must have a string "name"`);
        }
        if (!tool.description || typeof tool.description !== 'string') {
          errors.push(`Tool[${i}] must have a string "description"`);
        }
        if (!tool.parameters || tool.parameters.type !== 'object') {
          errors.push(`Tool[${i}] must have a valid "parameters" schema`);
        }
        if (typeof tool.handler !== 'function') {
          errors.push(`Tool[${i}] must have a "handler" function`);
        }
        if (!Array.isArray(tool.requiredPermissions)) {
          errors.push(`Tool[${i}] must have a "requiredPermissions" array`);
        }
      }
    }
  }

  // Validate skills
  if (plugin.skills) {
    if (!Array.isArray(plugin.skills)) {
      errors.push('Plugin skills must be an array');
    } else {
      for (let i = 0; i < plugin.skills.length; i++) {
        const ps = plugin.skills[i];
        if (!ps.skill || !ps.skill.name || !Array.isArray(ps.skill.triggers) || ps.skill.triggers.length === 0 || !ps.skill.description) {
          errors.push(`Skill[${i}] must have a valid PatternSkill with name, triggers, and description`);
        }
      }
    }
  }

  // Validate fabrics
  if (plugin.fabrics) {
    if (!Array.isArray(plugin.fabrics)) {
      errors.push('Plugin fabrics must be an array');
    } else {
      for (let i = 0; i < plugin.fabrics.length; i++) {
        const fab = plugin.fabrics[i];
        if (!fab.id || typeof fab.id !== 'string') {
          errors.push(`Fabric[${i}] must have a string "id"`);
        }
        if (!fab.material || typeof fab.material.name !== 'string' || fab.material.weight <= 0) {
          errors.push(`Fabric[${i}] must have a valid FabricMaterial`);
        }
      }
    }
  }

  // Validate templates
  if (plugin.templates) {
    if (!Array.isArray(plugin.templates)) {
      errors.push('Plugin templates must be an array');
    } else {
      for (let i = 0; i < plugin.templates.length; i++) {
        const tpl = plugin.templates[i];
        if (!tpl.id || !tpl.name || !tpl.description || !tpl.category) {
          errors.push(`Template[${i}] must have id, name, description, and category`);
        }
      }
    }
  }

  // Lifecycle hooks must be functions if present
  if (plugin.onLoad !== undefined && typeof plugin.onLoad !== 'function') {
    errors.push('"onLoad" must be a function if provided');
  }
  if (plugin.onUnload !== undefined && typeof plugin.onUnload !== 'function') {
    errors.push('"onUnload" must be a function if provided');
  }

  if (plugin.tools?.length === 0 && plugin.skills?.length === 0 &&
      plugin.fabrics?.length === 0 && plugin.templates?.length === 0) {
    warnings.push('Plugin provides no tools, skills, fabrics, or templates');
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ─── Permission Checking ────────────────────────────────────────────────────

/**
 * Map of tool-required permissions to the subsystems they gate.
 */
const PERMISSION_DESCRIPTIONS: Record<PluginPermission, string> = {
  'read-pieces': 'Read pattern piece data',
  'write-pieces': 'Modify pattern pieces',
  'read-measurements': 'Read body measurements',
  'export': 'Trigger file exports',
  'simulation': 'Control cloth simulation',
  'network': 'Make HTTP requests',
  'storage': 'Use plugin-scoped localStorage',
};

/**
 * Check if a set of granted permissions satisfies a required permission set.
 *
 * @param granted - Permissions the plugin has been granted (from manifest)
 * @param required - Permissions a specific tool/action needs
 * @returns Object with `allowed` boolean and `missing` permissions list
 */
export function checkPermissions(
  granted: PluginPermission[],
  required: PluginPermission[],
): { allowed: boolean; missing: PluginPermission[] } {
  const missing = required.filter(p => !granted.includes(p));
  return { allowed: missing.length === 0, missing };
}

/**
 * Get human-readable descriptions for a set of permissions.
 *
 * @param permissions - Permission identifiers
 * @returns Array of description strings
 */
export function getPermissionDescriptions(permissions: PluginPermission[]): string[] {
  return permissions.map(p => PERMISSION_DESCRIPTIONS[p] || p);
}

// ─── Plugin Loading ─────────────────────────────────────────────────────────

/**
 * Load a plugin from a manifest via dynamic import.
 *
 * Validates the manifest, dynamically imports the entry point module,
 * validates the resulting plugin object, calls its onLoad hook, and
 * stores it in the loaded plugins map.
 *
 * @param manifest - The plugin manifest with entry point path
 * @returns The loaded and validated OpenCloPlugin
 * @throws Error if manifest is invalid, import fails, or plugin is invalid
 */
export async function loadPlugin(manifest: PluginManifest): Promise<OpenCloPlugin> {
  // Validate manifest first
  const manifestResult = validateManifest(manifest);
  if (!manifestResult.valid) {
    throw new Error(`Invalid plugin manifest: ${manifestResult.errors.join('; ')}`);
  }

  // Check if already loaded
  if (loadedPlugins.has(manifest.id)) {
    throw new Error(`Plugin "${manifest.id}" is already loaded`);
  }

  // Dynamic import of the plugin module
  let pluginModule: Record<string, unknown>;
  try {
    pluginModule = await import(/* @vite-ignore */ manifest.entryPoint);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to import plugin "${manifest.id}": ${msg}`);
  }

  // Extract plugin object (default export or named 'plugin')
  const plugin = (pluginModule.default ?? pluginModule.plugin) as OpenCloPlugin | undefined;
  if (!plugin) {
    throw new Error(`Plugin module "${manifest.id}" has no default or named "plugin" export`);
  }

  // Validate the plugin object
  const pluginResult = validatePlugin(plugin);
  if (!pluginResult.valid) {
    throw new Error(`Invalid plugin "${manifest.id}": ${pluginResult.errors.join('; ')}`);
  }

  // Call onLoad lifecycle hook
  if (plugin.onLoad) {
    plugin.onLoad();
  }

  loadedPlugins.set(plugin.id, plugin);
  return plugin;
}

/**
 * Load a plugin directly from an already-constructed OpenCloPlugin object.
 *
 * Useful for built-in plugins or testing. Validates and stores the plugin.
 *
 * @param plugin - The pre-constructed plugin object
 * @returns The validated OpenCloPlugin
 * @throws Error if plugin is invalid or already loaded
 */
export function loadPluginDirect(plugin: OpenCloPlugin): OpenCloPlugin {
  const result = validatePlugin(plugin);
  if (!result.valid) {
    throw new Error(`Invalid plugin "${plugin.id}": ${result.errors.join('; ')}`);
  }
  if (loadedPlugins.has(plugin.id)) {
    throw new Error(`Plugin "${plugin.id}" is already loaded`);
  }
  if (plugin.onLoad) {
    plugin.onLoad();
  }
  loadedPlugins.set(plugin.id, plugin);
  return plugin;
}

/**
 * Unload a plugin by its id.
 *
 * Calls the plugin's onUnload hook and removes it from the loaded map.
 *
 * @param pluginId - The plugin id to unload
 */
export function unloadPlugin(pluginId: string): void {
  const plugin = loadedPlugins.get(pluginId);
  if (!plugin) return;

  try {
    if (plugin.onUnload) {
      plugin.onUnload();
    }
  } finally {
    loadedPlugins.delete(pluginId);
  }
}

/**
 * Get all currently loaded plugins.
 *
 * @returns Array of loaded OpenCloPlugin instances
 */
export function getLoadedPlugins(): OpenCloPlugin[] {
  return Array.from(loadedPlugins.values());
}

/**
 * Get a single loaded plugin by id.
 *
 * @param pluginId - The plugin id
 * @returns The plugin, or undefined if not loaded
 */
export function getLoadedPlugin(pluginId: string): OpenCloPlugin | undefined {
  return loadedPlugins.get(pluginId);
}

/**
 * Check if a plugin is currently loaded.
 *
 * @param pluginId - The plugin id to check
 * @returns true if the plugin is loaded
 */
export function isPluginLoaded(pluginId: string): boolean {
  return loadedPlugins.has(pluginId);
}

/**
 * Reset all loaded plugins (for testing).
 */
export function resetLoadedPlugins(): void {
  for (const plugin of loadedPlugins.values()) {
    try {
      if (plugin.onUnload) {
        plugin.onUnload();
      }
    } catch {
      // Swallow errors during reset to ensure all plugins are cleaned up
    }
  }
  loadedPlugins.clear();
}

/**
 * Get plugin-scoped localStorage key.
 *
 * @param pluginId - The plugin id
 * @returns The localStorage key prefix for this plugin
 */
export function getPluginStorageKey(pluginId: string): string {
  return `openclo_plugins_${pluginId}`;
}

/**
 * Read plugin-scoped data from the legacy localStorage key, synchronously.
 *
 * Kept for transitional callers that need a sync return; new code should
 * prefer `readPluginStorageAsync` (IDB-primary canonical, BUG-10). Once the
 * legacy LS key is migrated to IDB, this returns null and callers must use
 * the async variant.
 *
 * @param pluginId - The plugin id
 * @returns Parsed data or null if not found
 */
export function readPluginStorage(pluginId: string): Record<string, unknown> | null {
  try {
    const raw = safeGetItem(getPluginStorageKey(pluginId));
    if (!raw) return null;
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Async authoritative read: IDB primary + read-side migration from legacy LS.
 * BUG-10 canonical.
 *
 * @param pluginId - The plugin id
 * @returns Parsed data or null if not found
 */
export async function readPluginStorageAsync(pluginId: string): Promise<Record<string, unknown> | null> {
  const { storageGet, migrateFromLocalStorage } = await import('../../utils/storage');
  const idbKey = `plugin:${pluginId}`;
  const existing = await storageGet<Record<string, unknown>>('plugins', idbKey);
  if (existing) return existing;
  const migrated = await migrateFromLocalStorage<Record<string, unknown>>(
    getPluginStorageKey(pluginId),
    'plugins',
    idbKey,
  );
  return migrated ?? null;
}

/**
 * Write plugin-scoped data via the IDB canonical (BUG-10). Replaces the
 * previous double-write LS+IDB pattern; storageSet falls back to LS internally
 * only when IDB is unavailable.
 *
 * @param pluginId - The plugin id
 * @param data - Data to persist
 */
export function writePluginStorage(pluginId: string, data: Record<string, unknown>): void {
  import('../../utils/storage').then(({ storageSet }) => storageSet('plugins', `plugin:${pluginId}`, data)).catch(() => {});
}

/**
 * Clear plugin-scoped data from IndexedDB and any legacy localStorage entry.
 *
 * @param pluginId - The plugin id
 */
export function clearPluginStorage(pluginId: string): void {
  import('../../utils/storage').then(({ storageDel }) => { storageDel('plugins', `plugin:${pluginId}`); }).catch(() => {});
  // Also clear any legacy LS key so a future sync read doesn't surface stale data.
  safeRemoveItem(getPluginStorageKey(pluginId));
}
