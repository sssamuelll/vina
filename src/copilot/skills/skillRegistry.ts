/**
 * Unified Skill Registry — single source of truth for all skills.
 *
 * Manages core and community skills with IndexedDB persistence,
 * NSID-based identification, and event-driven updates.
 *
 * @module skills/skillRegistry
 */

import type { NSID } from './nsid';
import { isValidNSID } from './nsid';
import type { RegisteredSkill, SkillSource } from './registryTypes';
import type { CommunitySkill } from './communityFormat';
import { SkillPersistence } from './skillPersistence';
import { SkillValidator } from './skillValidator';
import { SkillEventEmitter, type SkillEvent, type SkillEventHandler } from './skillEvents';
import { CORE_SKILLS, isCoreSkill } from './coreSkills';

// ─── Error Classes ─────────────────────────────────────────────────────────

export class InvalidNSIDError extends Error {
  constructor(nsid: string) {
    super(`Invalid NSID format: "${nsid}". Expected "author:slug".`);
    this.name = 'InvalidNSIDError';
  }
}

export class SkillValidationError extends Error {
  constructor(public errors: string[]) {
    super(`Skill validation failed: ${errors.join('; ')}`);
    this.name = 'SkillValidationError';
  }
}

export class DuplicateSkillError extends Error {
  constructor(nsid: NSID) {
    super(`Skill "${nsid}" is already registered`);
    this.name = 'DuplicateSkillError';
  }
}

export class CoreSkillProtectedError extends Error {
  constructor(nsid: NSID) {
    super(`Cannot unregister core skill "${nsid}"`);
    this.name = 'CoreSkillProtectedError';
  }
}

// ─── Unified Registry ──────────────────────────────────────────────────────

/**
 * Unified skill registry with persistence and events.
 *
 * @example
 * const registry = SkillRegistry.getInstance();
 * await registry.initialize();
 *
 * // Register a community skill
 * const nsid = await registry.registerFromJSON(jsonString);
 *
 * // Find skill by trigger
 * const skill = registry.findByTrigger('bodice');
 *
 * // Subscribe to events
 * registry.on('skill:registered', (nsid, skill) => { ... });
 */
export class SkillRegistry {
  private static instance: SkillRegistry | null = null;

  private skills: Map<NSID, RegisteredSkill> = new Map();
  private triggerIndex: Map<string, NSID[]> = new Map();
  private preferences: Map<string, NSID> = new Map();

  private persistence: SkillPersistence;
  private validator: SkillValidator;
  private events: SkillEventEmitter;

  private initialized = false;

  private constructor() {
    this.persistence = new SkillPersistence();
    this.validator = new SkillValidator();
    this.events = new SkillEventEmitter();
  }

  /**
   * Get the singleton instance.
   */
  static getInstance(): SkillRegistry {
    if (!SkillRegistry.instance) {
      SkillRegistry.instance = new SkillRegistry();
    }
    return SkillRegistry.instance;
  }

  /**
   * Initialize the registry: load core skills and persisted community skills.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Open persistence
    await this.persistence.open();

    // Migrate from localStorage if needed
    await this.persistence.migrateFromLocalStorage();

    // Load core skills
    for (const skill of CORE_SKILLS) {
      this.skills.set(skill.nsid, skill);
      this.indexTriggers(skill.nsid, skill.skill.triggers);
    }

    // Load persisted community skills
    const persisted = await this.persistence.getAllSkills();
    for (const skill of persisted) {
      this.skills.set(skill.nsid, skill);
      if (skill.enabled) {
        this.indexTriggers(skill.nsid, skill.skill.triggers);
      }
    }

    // Load preferences
    const prefs = await this.persistence.getAllPreferences();
    for (const pref of prefs) {
      this.preferences.set(pref.trigger, pref.preferredNsid);
    }

    this.initialized = true;
  }

  // ─── Registration ────────────────────────────────────────────────────────

  /**
   * Register a community skill from JSON string.
   */
  async registerFromJSON(json: string): Promise<NSID> {
    let parsed: CommunitySkill;
    try {
      parsed = JSON.parse(json) as CommunitySkill;
    } catch {
      throw new Error('Invalid JSON');
    }
    return this.register(parsed);
  }

  /**
   * Register a community skill.
   */
  async register(communitySkill: CommunitySkill, source: SkillSource = 'community'): Promise<NSID> {
    // Validate
    const validation = this.validator.validateCommunitySkill(communitySkill);
    if (!validation.valid) {
      throw new SkillValidationError(validation.errors);
    }

    // Parse NSID
    const nsidStr = communitySkill.metadata.id;
    if (!isValidNSID(nsidStr)) {
      throw new InvalidNSIDError(nsidStr);
    }
    const nsid = nsidStr as NSID;

    // Check duplicate
    if (this.skills.has(nsid)) {
      throw new DuplicateSkillError(nsid);
    }

    // Compute checksum
    const checksum = await this.validator.computeChecksum(communitySkill.skill);

    // Create registered skill
    const registered: RegisteredSkill = {
      nsid,
      source,
      version: communitySkill.metadata.version,
      checksum,
      installedAt: Date.now(),
      updatedAt: Date.now(),
      enabled: true,
      skill: communitySkill.skill,
      metadata: communitySkill.metadata,
    };

    // Save to memory and persistence
    this.skills.set(nsid, registered);
    this.indexTriggers(nsid, registered.skill.triggers);

    if (source !== 'core') {
      await this.persistence.saveSkill(registered);
    }

    // Emit event
    this.events.emit('skill:registered', nsid, registered);

    return nsid;
  }

  /**
   * Unregister a skill by NSID.
   */
  async unregister(nsid: NSID | string): Promise<boolean> {
    const nsidTyped = nsid as NSID;

    if (isCoreSkill(nsidTyped)) {
      throw new CoreSkillProtectedError(nsidTyped);
    }

    const skill = this.skills.get(nsidTyped);
    if (!skill) return false;

    // Remove from memory
    this.skills.delete(nsidTyped);
    this.removeTriggers(nsidTyped, skill.skill.triggers);

    // Remove from persistence
    await this.persistence.deleteSkill(nsidTyped);

    // Emit event
    this.events.emit('skill:unregistered', nsidTyped);

    return true;
  }

  /**
   * Enable a skill.
   */
  async enable(nsid: NSID | string): Promise<void> {
    const nsidTyped = nsid as NSID;
    const skill = this.skills.get(nsidTyped);
    if (!skill) return;

    skill.enabled = true;
    skill.updatedAt = Date.now();
    this.indexTriggers(nsidTyped, skill.skill.triggers);

    if (!isCoreSkill(nsidTyped)) {
      await this.persistence.saveSkill(skill);
    }

    this.events.emit('skill:enabled', nsidTyped, skill);
  }

  /**
   * Disable a skill.
   */
  async disable(nsid: NSID | string): Promise<void> {
    const nsidTyped = nsid as NSID;
    const skill = this.skills.get(nsidTyped);
    if (!skill) return;

    skill.enabled = false;
    skill.updatedAt = Date.now();
    this.removeTriggers(nsidTyped, skill.skill.triggers);

    if (!isCoreSkill(nsidTyped)) {
      await this.persistence.saveSkill(skill);
    }

    this.events.emit('skill:disabled', nsidTyped, skill);
  }

  // ─── Queries ─────────────────────────────────────────────────────────────

  get(nsid: NSID | string): RegisteredSkill | undefined {
    return this.skills.get(nsid as NSID);
  }

  has(nsid: NSID | string): boolean {
    return this.skills.has(nsid as NSID);
  }

  getAll(): RegisteredSkill[] {
    return Array.from(this.skills.values());
  }

  getBySource(source: SkillSource): RegisteredSkill[] {
    return this.getAll().filter(s => s.source === source);
  }

  getEnabled(): RegisteredSkill[] {
    return this.getAll().filter(s => s.enabled);
  }

  get size(): number {
    return this.skills.size;
  }

  get coreCount(): number {
    return this.getBySource('core').length;
  }

  get communityCount(): number {
    return this.getBySource('community').length;
  }

  // ─── Trigger Matching ────────────────────────────────────────────────────

  /**
   * Find the best skill for a trigger phrase.
   */
  findByTrigger(phrase: string): RegisteredSkill | undefined {
    const normalized = phrase.toLowerCase();

    // Check exact trigger match
    const nsids = this.triggerIndex.get(normalized);
    if (!nsids || nsids.length === 0) {
      // Try partial match
      for (const [trigger, ids] of this.triggerIndex) {
        if (normalized.includes(trigger) && ids.length > 0) {
          // Check preference
          const preferred = this.preferences.get(trigger);
          if (preferred && ids.includes(preferred)) {
            return this.skills.get(preferred);
          }
          return this.skills.get(ids[0]);
        }
      }
      return undefined;
    }

    // Check preference
    const preferred = this.preferences.get(normalized);
    if (preferred && nsids.includes(preferred)) {
      return this.skills.get(preferred);
    }

    return this.skills.get(nsids[0]);
  }

  /**
   * Find all skills matching a trigger (for conflict detection).
   */
  findAllByTrigger(phrase: string): RegisteredSkill[] {
    const normalized = phrase.toLowerCase();
    const nsids = this.triggerIndex.get(normalized) ?? [];
    return nsids.map(nsid => this.skills.get(nsid)).filter((s): s is RegisteredSkill => !!s);
  }

  // ─── Conflict Resolution ─────────────────────────────────────────────────

  /**
   * Get all triggers with multiple competing skills.
   */
  getConflicts(): Map<string, NSID[]> {
    const conflicts = new Map<string, NSID[]>();
    for (const [trigger, nsids] of this.triggerIndex) {
      if (nsids.length > 1) {
        conflicts.set(trigger, [...nsids]);
      }
    }
    return conflicts;
  }

  /**
   * Set user preference for a trigger.
   */
  async setPreference(trigger: string, nsid: NSID): Promise<void> {
    this.preferences.set(trigger.toLowerCase(), nsid);
    await this.persistence.setPreference(trigger.toLowerCase(), nsid);
  }

  /**
   * Get user preference for a trigger.
   */
  getPreference(trigger: string): NSID | undefined {
    return this.preferences.get(trigger.toLowerCase());
  }

  // ─── Events ──────────────────────────────────────────────────────────────

  /**
   * Subscribe to skill events.
   */
  on(event: SkillEvent, handler: SkillEventHandler): () => void {
    return this.events.on(event, handler);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private indexTriggers(nsid: NSID, triggers: string[]): void {
    for (const trigger of triggers) {
      const key = trigger.toLowerCase();
      const existing = this.triggerIndex.get(key) ?? [];
      if (!existing.includes(nsid)) {
        existing.push(nsid);
        this.triggerIndex.set(key, existing);
      }
    }
  }

  private removeTriggers(nsid: NSID, triggers: string[]): void {
    for (const trigger of triggers) {
      const key = trigger.toLowerCase();
      const existing = this.triggerIndex.get(key);
      if (existing) {
        const filtered = existing.filter(n => n !== nsid);
        if (filtered.length === 0) {
          this.triggerIndex.delete(key);
        } else {
          this.triggerIndex.set(key, filtered);
        }
      }
    }
  }
}

// ─── Compatibility Exports ─────────────────────────────────────────────────

/**
 * Reset the singleton (for testing).
 */
export async function resetSkillRegistry(): Promise<void> {
  if (SkillRegistry['instance']) {
    const instance = SkillRegistry['instance'];
    await instance['persistence'].close();
    SkillRegistry['instance'] = null;
  }
}

/**
 * Get the default skill registry (compatibility with old API).
 * @deprecated Use SkillRegistry.getInstance() instead
 */
export function getDefaultSkillRegistry(): SkillRegistry {
  return SkillRegistry.getInstance();
}

/**
 * Reset the default skill registry (compatibility).
 * @deprecated Use resetSkillRegistry() instead
 */
export function resetDefaultSkillRegistry(): void {
  resetSkillRegistry();
}

// Re-export old CORE_SKILLS for compatibility
export { CORE_SKILLS } from './coreSkills';
