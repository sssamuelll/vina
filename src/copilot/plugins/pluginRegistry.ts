/**
 * Plugin Registry — registers plugin-provided assets into core registries.
 *
 * Handles namespacing of plugin tools (to avoid conflicts with core tools),
 * registration of plugin skills, fabrics, and templates, and provides
 * conflict detection when multiple plugins try to register the same name.
 *
 * @module plugins/pluginRegistry
 */

import type { ToolDefinition, ToolResult } from '../tools/registry';
import type {
  OpenCloPlugin,
  PluginFabric,
  PluginPermission,
  PluginSkill,
  PluginTemplate,
  PluginTool,
} from './types';
import { checkPermissions } from './pluginLoader';

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * A registered plugin tool with its fully-namespaced name.
 */
export interface RegisteredPluginTool {
  /** Namespaced tool name: `${pluginId}.${toolName}` */
  namespacedName: string;
  /** Original tool name before namespacing */
  originalName: string;
  /** Plugin id that owns this tool */
  pluginId: string;
  /** The tool definition as a core ToolDefinition */
  toolDefinition: ToolDefinition;
}

/**
 * A registered plugin skill with its source plugin id.
 */
export interface RegisteredPluginSkill {
  /** Plugin id that owns this skill */
  pluginId: string;
  /** The plugin skill wrapper */
  pluginSkill: PluginSkill;
}

/**
 * A registered plugin fabric with its namespaced id.
 */
export interface RegisteredPluginFabric {
  /** Namespaced fabric id: `${pluginId}.${fabricId}` */
  namespacedId: string;
  /** Plugin id that owns this fabric */
  pluginId: string;
  /** The plugin fabric definition */
  pluginFabric: PluginFabric;
}

/**
 * A registered plugin template with its namespaced id.
 */
export interface RegisteredPluginTemplate {
  /** Namespaced template id: `${pluginId}.${templateId}` */
  namespacedId: string;
  /** Plugin id that owns this template */
  pluginId: string;
  /** The plugin template definition */
  pluginTemplate: PluginTemplate;
}

/**
 * Conflict information when two plugins attempt to register the same name.
 */
export interface PluginConflict {
  /** Type of conflicting asset */
  type: 'tool' | 'skill' | 'fabric' | 'template';
  /** The conflicting name */
  name: string;
  /** Plugin id of the existing registration */
  existingPluginId: string;
  /** Plugin id of the new (rejected) registration */
  newPluginId: string;
}

// ─── Plugin Registry ────────────────────────────────────────────────────────

/**
 * Central registry for plugin-provided assets.
 *
 * Manages namespacing to prevent conflicts between plugins and between
 * plugin tools and core tools. All plugin tools are namespaced as
 * `${pluginId}.${toolName}`.
 */
export class PluginRegistry {
  private tools: Map<string, RegisteredPluginTool> = new Map();
  private skills: Map<string, RegisteredPluginSkill> = new Map();
  private fabrics: Map<string, RegisteredPluginFabric> = new Map();
  private templates: Map<string, RegisteredPluginTemplate> = new Map();
  private conflicts: PluginConflict[] = [];
  private pluginPermissions: Map<string, PluginPermission[]> = new Map();

  /**
   * Register all assets from a plugin.
   *
   * Tools are namespaced as `${pluginId}.${toolName}`. Skills, fabrics,
   * and templates are also namespaced. Conflicts are recorded but do not
   * throw — the conflicting registration is simply skipped.
   *
   * @param plugin - The plugin to register
   * @param grantedPermissions - Permissions granted to this plugin
   * @returns Array of conflicts encountered (empty if none)
   */
  registerPlugin(plugin: OpenCloPlugin, grantedPermissions: PluginPermission[]): PluginConflict[] {
    const newConflicts: PluginConflict[] = [];
    this.pluginPermissions.set(plugin.id, grantedPermissions);

    // Register tools
    if (plugin.tools) {
      for (const tool of plugin.tools) {
        const conflict = this.registerTool(plugin.id, tool, grantedPermissions);
        if (conflict) newConflicts.push(conflict);
      }
    }

    // Register skills
    if (plugin.skills) {
      for (const skill of plugin.skills) {
        const conflict = this.registerSkill(plugin.id, skill);
        if (conflict) newConflicts.push(conflict);
      }
    }

    // Register fabrics
    if (plugin.fabrics) {
      for (const fabric of plugin.fabrics) {
        const conflict = this.registerFabric(plugin.id, fabric);
        if (conflict) newConflicts.push(conflict);
      }
    }

    // Register templates
    if (plugin.templates) {
      for (const template of plugin.templates) {
        const conflict = this.registerTemplate(plugin.id, template);
        if (conflict) newConflicts.push(conflict);
      }
    }

    this.conflicts.push(...newConflicts);
    return newConflicts;
  }

  /**
   * Unregister all assets from a plugin.
   *
   * @param pluginId - The plugin id to unregister
   */
  unregisterPlugin(pluginId: string): void {
    // Remove tools
    for (const [key, entry] of this.tools.entries()) {
      if (entry.pluginId === pluginId) {
        this.tools.delete(key);
      }
    }

    // Remove skills
    for (const [key, entry] of this.skills.entries()) {
      if (entry.pluginId === pluginId) {
        this.skills.delete(key);
      }
    }

    // Remove fabrics
    for (const [key, entry] of this.fabrics.entries()) {
      if (entry.pluginId === pluginId) {
        this.fabrics.delete(key);
      }
    }

    // Remove templates
    for (const [key, entry] of this.templates.entries()) {
      if (entry.pluginId === pluginId) {
        this.templates.delete(key);
      }
    }

    // Remove permission mapping
    this.pluginPermissions.delete(pluginId);

    // Clean up conflicts
    this.conflicts = this.conflicts.filter(
      c => c.existingPluginId !== pluginId && c.newPluginId !== pluginId,
    );
  }

  // ─── Tool Registration ──────────────────────────────────────────────

  /**
   * Register a single plugin tool with namespacing.
   *
   * @param pluginId - The plugin that owns this tool
   * @param tool - The plugin tool definition
   * @param grantedPermissions - Permissions granted to the owning plugin
   * @returns A conflict object if the name is taken, or null
   */
  private registerTool(
    pluginId: string,
    tool: PluginTool,
    grantedPermissions: PluginPermission[],
  ): PluginConflict | null {
    const namespacedName = `${pluginId}.${tool.name}`;

    // Check for conflicts
    if (this.tools.has(namespacedName)) {
      const existing = this.tools.get(namespacedName)!;
      return {
        type: 'tool',
        name: namespacedName,
        existingPluginId: existing.pluginId,
        newPluginId: pluginId,
      };
    }

    // Create a sandboxed ToolDefinition wrapper
    const toolDef: ToolDefinition = {
      name: namespacedName,
      description: `[Plugin: ${pluginId}] ${tool.description}`,
      parameters: tool.parameters,
      execute: async (params: Record<string, unknown>): Promise<ToolResult> => {
        // Check permissions at execution time
        const permCheck = checkPermissions(grantedPermissions, tool.requiredPermissions);
        if (!permCheck.allowed) {
          return {
            success: false,
            error: `Permission denied: plugin "${pluginId}" lacks ${permCheck.missing.join(', ')}`,
          };
        }
        return tool.handler(params);
      },
    };

    this.tools.set(namespacedName, {
      namespacedName,
      originalName: tool.name,
      pluginId,
      toolDefinition: toolDef,
    });

    return null;
  }

  /**
   * Register a single plugin skill.
   *
   * @param pluginId - The plugin that owns this skill
   * @param pluginSkill - The plugin skill wrapper
   * @returns A conflict object if the name is taken, or null
   */
  private registerSkill(pluginId: string, pluginSkill: PluginSkill): PluginConflict | null {
    const namespacedName = `${pluginId}.${pluginSkill.skill.name}`;

    if (this.skills.has(namespacedName)) {
      const existing = this.skills.get(namespacedName)!;
      return {
        type: 'skill',
        name: namespacedName,
        existingPluginId: existing.pluginId,
        newPluginId: pluginId,
      };
    }

    this.skills.set(namespacedName, { pluginId, pluginSkill });
    return null;
  }

  /**
   * Register a single plugin fabric.
   *
   * @param pluginId - The plugin that owns this fabric
   * @param pluginFabric - The plugin fabric definition
   * @returns A conflict object if the id is taken, or null
   */
  private registerFabric(pluginId: string, pluginFabric: PluginFabric): PluginConflict | null {
    const namespacedId = `${pluginId}.${pluginFabric.id}`;

    if (this.fabrics.has(namespacedId)) {
      const existing = this.fabrics.get(namespacedId)!;
      return {
        type: 'fabric',
        name: namespacedId,
        existingPluginId: existing.pluginId,
        newPluginId: pluginId,
      };
    }

    this.fabrics.set(namespacedId, { namespacedId, pluginId, pluginFabric });
    return null;
  }

  /**
   * Register a single plugin template.
   *
   * @param pluginId - The plugin that owns this template
   * @param pluginTemplate - The plugin template definition
   * @returns A conflict object if the id is taken, or null
   */
  private registerTemplate(pluginId: string, pluginTemplate: PluginTemplate): PluginConflict | null {
    const namespacedId = `${pluginId}.${pluginTemplate.id}`;

    if (this.templates.has(namespacedId)) {
      const existing = this.templates.get(namespacedId)!;
      return {
        type: 'template',
        name: namespacedId,
        existingPluginId: existing.pluginId,
        newPluginId: pluginId,
      };
    }

    this.templates.set(namespacedId, { namespacedId, pluginId, pluginTemplate });
    return null;
  }

  // ─── Getters ────────────────────────────────────────────────────────

  /**
   * Get all registered plugin tools as core ToolDefinitions.
   *
   * @returns Array of ToolDefinition objects for use with ToolRegistry
   */
  getToolDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map(t => t.toolDefinition);
  }

  /**
   * Get all registered plugin skills.
   *
   * @returns Array of registered plugin skill entries
   */
  getRegisteredSkills(): RegisteredPluginSkill[] {
    return Array.from(this.skills.values());
  }

  /**
   * Get all registered plugin fabrics.
   *
   * @returns Array of registered plugin fabric entries
   */
  getRegisteredFabrics(): RegisteredPluginFabric[] {
    return Array.from(this.fabrics.values());
  }

  /**
   * Get all registered plugin templates.
   *
   * @returns Array of registered plugin template entries
   */
  getRegisteredTemplates(): RegisteredPluginTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * Get all conflicts encountered during registration.
   *
   * @returns Array of conflict objects
   */
  getConflicts(): PluginConflict[] {
    return [...this.conflicts];
  }

  /**
   * Get the number of registered tools from all plugins.
   */
  get toolCount(): number {
    return this.tools.size;
  }

  /**
   * Get the number of registered skills from all plugins.
   */
  get skillCount(): number {
    return this.skills.size;
  }

  /**
   * Get the number of registered fabrics from all plugins.
   */
  get fabricCount(): number {
    return this.fabrics.size;
  }

  /**
   * Get the number of registered templates from all plugins.
   */
  get templateCount(): number {
    return this.templates.size;
  }

  /**
   * Check if a namespaced tool name is registered.
   *
   * @param namespacedName - Fully namespaced tool name
   * @returns true if registered
   */
  hasTool(namespacedName: string): boolean {
    return this.tools.has(namespacedName);
  }

  /**
   * Get tools registered by a specific plugin.
   *
   * @param pluginId - The plugin id
   * @returns Array of registered tool entries
   */
  getToolsByPlugin(pluginId: string): RegisteredPluginTool[] {
    return Array.from(this.tools.values()).filter(t => t.pluginId === pluginId);
  }

  /**
   * Reset the registry (clear all registrations and conflicts).
   */
  reset(): void {
    this.tools.clear();
    this.skills.clear();
    this.fabrics.clear();
    this.templates.clear();
    this.conflicts = [];
    this.pluginPermissions.clear();
  }
}

// ─── Default Instance ───────────────────────────────────────────────────────

let _defaultPluginRegistry: PluginRegistry | null = null;

/**
 * Get or create the default global plugin registry.
 *
 * @returns The default PluginRegistry instance
 */
export function getDefaultPluginRegistry(): PluginRegistry {
  if (!_defaultPluginRegistry) {
    _defaultPluginRegistry = new PluginRegistry();
  }
  return _defaultPluginRegistry;
}

/**
 * Reset the default plugin registry (for testing).
 */
export function resetDefaultPluginRegistry(): void {
  _defaultPluginRegistry = null;
}
