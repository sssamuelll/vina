/**
 * Plugin System — public API for the OpenClo plugin architecture.
 *
 * Re-exports all plugin types, the loader, registry, manager, and formula integration.
 *
 * @module plugins
 */

export type {
  PluginPermission,
  PluginTool,
  PluginSkill,
  PluginFabric,
  PluginTemplate,
  PluginManifest,
  OpenCloPlugin,
  InstalledPlugin,
  ValidationResult,
} from './types';
export { ALL_PLUGIN_PERMISSIONS } from './types';

export {
  loadPlugin,
  loadPluginDirect,
  unloadPlugin,
  getLoadedPlugins,
  getLoadedPlugin,
  isPluginLoaded,
  resetLoadedPlugins,
  validatePlugin,
  validateManifest,
  checkPermissions,
  getPermissionDescriptions,
  parseSemver,
  satisfiesSemver,
  getPluginStorageKey,
  readPluginStorage,
  writePluginStorage,
  clearPluginStorage,
} from './pluginLoader';

export {
  PluginRegistry,
  getDefaultPluginRegistry,
  resetDefaultPluginRegistry,
} from './pluginRegistry';
export type {
  RegisteredPluginTool,
  RegisteredPluginSkill,
  RegisteredPluginFabric,
  RegisteredPluginTemplate,
  PluginConflict,
} from './pluginRegistry';

export {
  installPlugin,
  installPluginFromManifest,
  removePlugin,
  enablePlugin,
  disablePlugin,
  listInstalledPlugins,
  getInstalledPlugin,
  listEnabledPluginIds,
  loadEnabledPlugins,
  loadAndRegisterPlugin,
  resetPluginManager,
} from './pluginManager';

export {
  registerFormula,
  unregisterPluginFormulas,
  getCustomFormula,
  listCustomFormulas,
  listPluginFormulas,
  evaluateCustomFormula,
  validateCustomFormula,
  resetCustomFormulas,
} from './formulaPlugin';
export type { CustomFormula, FormulaValidationResult } from './formulaPlugin';
