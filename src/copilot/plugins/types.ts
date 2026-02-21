/**
 * Plugin System Types — interfaces for the OpenClo plugin architecture.
 *
 * Plugins extend OpenClo by providing custom tools, skills, fabrics,
 * templates, and formulas. They follow a strict permission model and
 * sandboxed lifecycle.
 *
 * @module plugins/types
 */

import type { PatternSkill } from '../skills/types';
import type { ToolParametersSchema, ToolResult } from '../tools/registry';
import type { FabricMaterial } from '../../utils/cloth/fabricLibrary';

// ─── Permissions ────────────────────────────────────────────────────────────

/**
 * Permissions a plugin can request.
 *
 * Each permission gates access to specific application subsystems:
 * - `read-pieces` — read pattern piece data
 * - `write-pieces` — modify pattern pieces
 * - `read-measurements` — read body measurement data
 * - `export` — trigger file exports (DXF, PDF, OBJ)
 * - `simulation` — control the cloth simulation engine
 * - `network` — make HTTP requests (e.g. for AI providers)
 * - `storage` — use plugin-scoped localStorage
 */
export type PluginPermission =
  | 'read-pieces'
  | 'write-pieces'
  | 'read-measurements'
  | 'export'
  | 'simulation'
  | 'network'
  | 'storage';

/** All valid permission values */
export const ALL_PLUGIN_PERMISSIONS: readonly PluginPermission[] = [
  'read-pieces',
  'write-pieces',
  'read-measurements',
  'export',
  'simulation',
  'network',
  'storage',
] as const;

// ─── Plugin Tool ────────────────────────────────────────────────────────────

/**
 * A tool provided by a plugin, structurally identical to a core ToolDefinition
 * but without the execute function (plugin tools are sandboxed).
 */
export interface PluginTool {
  /** Tool name (will be namespaced as `${pluginId}.${name}`) */
  name: string;
  /** Description for the LLM */
  description: string;
  /** JSON Schema for parameters */
  parameters: ToolParametersSchema;
  /** Required permissions for this tool to operate */
  requiredPermissions: PluginPermission[];
  /**
   * Handler that receives validated params and returns a result.
   * Plugin tools do NOT receive dispatch/getState directly — they
   * return declarative results that the registry translates.
   */
  handler: (params: Record<string, unknown>) => Promise<ToolResult>;
}

// ─── Plugin Skill ───────────────────────────────────────────────────────────

/**
 * A pattern-making skill provided by a plugin.
 * Wraps a PatternSkill with plugin metadata.
 */
export interface PluginSkill {
  /** Skill definition (same as core skills) */
  skill: PatternSkill;
}

// ─── Plugin Fabric ──────────────────────────────────────────────────────────

/**
 * A custom fabric material provided by a plugin.
 */
export interface PluginFabric {
  /** Unique fabric ID (will be namespaced as `${pluginId}.${id}`) */
  id: string;
  /** Fabric material definition */
  material: FabricMaterial;
}

// ─── Plugin Template ────────────────────────────────────────────────────────

/**
 * A pattern template provided by a plugin.
 */
export interface PluginTemplate {
  /** Template identifier */
  id: string;
  /** Display name */
  name: string;
  /** Description of the template */
  description: string;
  /** Template category (e.g. 'tops', 'bottoms', 'accessories') */
  category: string;
  /** Template data — piece definitions as JSON-serializable data */
  data: Record<string, unknown>;
}

// ─── Plugin Manifest ────────────────────────────────────────────────────────

/**
 * Manifest file declaring plugin metadata and requirements.
 * This is loaded before the plugin module itself, enabling
 * permission checking and compatibility validation upfront.
 */
export interface PluginManifest {
  /** Unique plugin identifier (reverse-domain, e.g. "com.openclo.dart-manipulator") */
  id: string;
  /** Display name */
  name: string;
  /** Semver version string */
  version: string;
  /** Author name or organization */
  author: string;
  /** Description (ideally bilingual ES/EN) */
  description: string;
  /** License identifier (e.g. "MIT", "Apache-2.0") */
  license: string;
  /** Minimum OpenClo version this plugin supports (semver range) */
  compatibleWith: string;
  /** Relative path to the main ES module entry point */
  entryPoint: string;
  /** Permissions this plugin requires */
  permissions: PluginPermission[];
}

// ─── OpenClo Plugin ─────────────────────────────────────────────────────────

/**
 * A fully loaded plugin instance.
 *
 * Plugins provide tools, skills, fabrics, and/or templates that extend
 * OpenClo's core functionality. They follow a lifecycle of load/unload
 * and can only access subsystems granted by their permissions.
 */
export interface OpenCloPlugin {
  /** Unique plugin identifier (matches manifest id) */
  id: string;
  /** Display name */
  name: string;
  /** Semver version string */
  version: string;
  /** Author name or organization */
  author: string;
  /** Description (ideally bilingual ES/EN) */
  description: string;
  /** License identifier */
  license: string;
  /** Minimum OpenClo version this plugin supports */
  compatibleWith: string;

  /** Custom agent tools provided by this plugin */
  tools?: PluginTool[];
  /** Custom pattern-making skills */
  skills?: PluginSkill[];
  /** Custom fabric materials */
  fabrics?: PluginFabric[];
  /** Custom pattern templates */
  templates?: PluginTemplate[];

  /** Called after the plugin is loaded and registered */
  onLoad?: () => void;
  /** Called before the plugin is unloaded */
  onUnload?: () => void;
}

// ─── Installed Plugin Info ──────────────────────────────────────────────────

/**
 * Persisted metadata for an installed plugin (stored in localStorage).
 */
export interface InstalledPlugin {
  /** Plugin manifest */
  manifest: PluginManifest;
  /** Whether the plugin is currently enabled */
  enabled: boolean;
  /** URL the plugin was installed from (for updates) */
  sourceUrl: string;
  /** ISO timestamp of installation */
  installedAt: string;
}

// ─── Validation ─────────────────────────────────────────────────────────────

/**
 * Result of validating a plugin, manifest, or skill.
 */
export interface ValidationResult {
  /** Whether validation passed */
  valid: boolean;
  /** Validation error messages (empty if valid) */
  errors: string[];
  /** Non-fatal warnings */
  warnings: string[];
}
