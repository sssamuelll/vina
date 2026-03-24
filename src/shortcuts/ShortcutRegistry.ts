/**
 * ShortcutRegistry — Centralized keyboard shortcut management.
 *
 * Stores default bindings, user overrides (localStorage), and runtime handlers.
 * Supports context-aware resolution (global/2d/3d/copilot) and conflict detection.
 *
 * User overrides are persisted to localStorage and restored on construction.
 */

import { safeGetItem, safeSetItem } from '../utils/safeStorage';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ShortcutContext = 'global' | '2d' | '3d' | 'copilot';
export type ShortcutCategory = 'Simulation' | '3D Tools' | '2D Tools' | 'Sewing' | 'Selection' | 'Edit' | 'File' | 'View';

export interface KeyCombo {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
}

export interface ShortcutDef {
  id: string;
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  label: string;
  category: ShortcutCategory;
  context: ShortcutContext;
}

const STORAGE_KEY = 'openclo-shortcut-overrides';

// ─── Registry ────────────────────────────────────────────────────────────────

export class ShortcutRegistry {
  private defaults = new Map<string, ShortcutDef>();
  private overrides = new Map<string, KeyCombo>();
  private handlers = new Map<string, () => void>();

  constructor(defaultDefs: ShortcutDef[]) {
    for (const def of defaultDefs) {
      this.defaults.set(def.id, def);
    }
    this.loadOverrides();
  }

  // ─── Binding resolution ─────────────────────────────────────────────

  /** Get the effective key combo for an action (override or default) */
  getBinding(actionId: string): KeyCombo | null {
    const override = this.overrides.get(actionId);
    if (override) return override;
    const def = this.defaults.get(actionId);
    if (def) return { key: def.key, ctrl: def.ctrl, shift: def.shift, alt: def.alt };
    return null;
  }

  /** Get the shortcut definition (label, category, context) */
  getDef(actionId: string): ShortcutDef | undefined {
    return this.defaults.get(actionId);
  }

  /** Get all shortcut definitions */
  getAllDefs(): ShortcutDef[] {
    return Array.from(this.defaults.values());
  }

  // ─── Handler registration ───────────────────────────────────────────

  registerHandler(actionId: string, handler: () => void): void {
    this.handlers.set(actionId, handler);
  }

  unregisterHandler(actionId: string): void {
    this.handlers.delete(actionId);
  }

  getHandler(actionId: string): (() => void) | undefined {
    return this.handlers.get(actionId);
  }

  // ─── Key event matching ─────────────────────────────────────────────

  /** Find the action that matches a keyboard event in the given contexts */
  matchEvent(e: KeyboardEvent, activeContexts: ShortcutContext[]): string | null {
    const key = e.key.toLowerCase();
    const ctrl = e.metaKey || e.ctrlKey;
    const shift = e.shiftKey;
    const alt = e.altKey;

    for (const [actionId, def] of this.defaults) {
      if (!activeContexts.includes(def.context)) continue;

      const binding = this.getBinding(actionId);
      if (!binding) continue;

      if (
        binding.key.toLowerCase() === key &&
        !!binding.ctrl === ctrl &&
        !!binding.shift === shift &&
        !!binding.alt === alt
      ) {
        return actionId;
      }
    }
    return null;
  }

  // ─── User customization ─────────────────────────────────────────────

  setOverride(actionId: string, combo: KeyCombo): void {
    this.overrides.set(actionId, combo);
    this.saveOverrides();
  }

  clearOverride(actionId: string): void {
    this.overrides.delete(actionId);
    this.saveOverrides();
  }

  resetAllOverrides(): void {
    this.overrides.clear();
    this.saveOverrides();
  }

  hasOverride(actionId: string): boolean {
    return this.overrides.has(actionId);
  }

  // ─── Conflict detection ─────────────────────────────────────────────

  /** Check if a key combo conflicts with an existing binding in the same context */
  findConflict(combo: KeyCombo, context: ShortcutContext, excludeId?: string): string | null {
    for (const [actionId, def] of this.defaults) {
      if (actionId === excludeId) continue;
      if (def.context !== context && def.context !== 'global' && context !== 'global') continue;

      const binding = this.getBinding(actionId);
      if (!binding) continue;

      if (
        binding.key.toLowerCase() === combo.key.toLowerCase() &&
        !!binding.ctrl === !!combo.ctrl &&
        !!binding.shift === !!combo.shift &&
        !!binding.alt === !!combo.alt
      ) {
        return actionId;
      }
    }
    return null;
  }

  // ─── Persistence ────────────────────────────────────────────────────

  private loadOverrides(): void {
    try {
      const raw = safeGetItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, KeyCombo>;
        for (const [id, combo] of Object.entries(parsed)) {
          this.overrides.set(id, combo);
        }
      }
    } catch {
      // Ignore corrupt data
    }
  }

  private saveOverrides(): void {
    const obj: Record<string, KeyCombo> = {};
    for (const [id, combo] of this.overrides) {
      obj[id] = combo;
    }
    safeSetItem(STORAGE_KEY, JSON.stringify(obj));
  }
}
