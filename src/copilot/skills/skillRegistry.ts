/**
 * Skill Registry — indexes all pattern skills by trigger phrases for fast lookup.
 *
 * Registers the five core skills (bodice, sleeve, skirt, collar, grading)
 * and provides lookup by name or trigger phrase.
 *
 * @module skills/skillRegistry
 */

import type { PatternSkill } from './types';
import { bodiceSkill } from './definitions/bodiceSkill';
import { sleeveSkill } from './definitions/sleeveSkill';
import { skirtSkill } from './definitions/skirtSkill';
import { collarSkill } from './definitions/collarSkill';
import { gradingSkill } from './definitions/gradingSkill';

/**
 * Central registry for pattern-making skills.
 *
 * Maintains a name→skill map and a trigger→skill index for
 * fast lookup when matching user messages.
 */
export class SkillRegistry {
  private skills: Map<string, PatternSkill> = new Map();
  private triggerIndex: Map<string, PatternSkill> = new Map();

  /**
   * Register a pattern skill.
   *
   * @param skill - The skill to register
   * @throws Error if a skill with the same name is already registered
   */
  register(skill: PatternSkill): void {
    if (this.skills.has(skill.name)) {
      throw new Error(`Skill "${skill.name}" is already registered`);
    }
    this.skills.set(skill.name, skill);
    for (const trigger of skill.triggers) {
      this.triggerIndex.set(trigger.toLowerCase(), skill);
    }
  }

  /**
   * Register multiple skills at once.
   *
   * @param skills - Array of skills to register
   */
  registerAll(skills: PatternSkill[]): void {
    for (const skill of skills) {
      this.register(skill);
    }
  }

  /**
   * Get a skill by name.
   *
   * @param name - Skill name
   * @returns The skill, or undefined if not found
   */
  get(name: string): PatternSkill | undefined {
    return this.skills.get(name);
  }

  /**
   * Find a skill that matches a trigger phrase.
   *
   * @param trigger - Trigger phrase (case-insensitive)
   * @returns The matching skill, or undefined
   */
  findByTrigger(trigger: string): PatternSkill | undefined {
    return this.triggerIndex.get(trigger.toLowerCase());
  }

  /**
   * List all registered skills.
   *
   * @returns Array of all registered skills
   */
  list(): PatternSkill[] {
    return Array.from(this.skills.values());
  }

  /**
   * List all registered skill names.
   *
   * @returns Array of skill name strings
   */
  listNames(): string[] {
    return Array.from(this.skills.keys());
  }

  /**
   * List all trigger phrases across all skills.
   *
   * @returns Array of trigger strings
   */
  listTriggers(): string[] {
    return Array.from(this.triggerIndex.keys());
  }

  /**
   * Get the number of registered skills.
   */
  get size(): number {
    return this.skills.size;
  }

  /**
   * Check if a skill is registered by name.
   *
   * @param name - Skill name to check
   */
  has(name: string): boolean {
    return this.skills.has(name);
  }

  /**
   * Unregister a skill by name.
   *
   * Removes the skill and all its trigger index entries.
   *
   * @param name - Skill name to unregister
   * @returns true if the skill was found and removed
   */
  unregister(name: string): boolean {
    const skill = this.skills.get(name);
    if (!skill) return false;

    this.skills.delete(name);
    for (const trigger of skill.triggers) {
      const key = trigger.toLowerCase();
      if (this.triggerIndex.get(key) === skill) {
        this.triggerIndex.delete(key);
      }
    }
    return true;
  }
}

// ─── All core skill definitions ─────────────────────────────────────────────

/** The five core pattern-making skills */
export const CORE_SKILLS: PatternSkill[] = [
  bodiceSkill,
  sleeveSkill,
  skirtSkill,
  collarSkill,
  gradingSkill,
];

// ─── Default Registry Instance ──────────────────────────────────────────────

let _defaultSkillRegistry: SkillRegistry | null = null;

/**
 * Get or create the default global skill registry with all core skills.
 *
 * @returns The default SkillRegistry instance
 */
export function getDefaultSkillRegistry(): SkillRegistry {
  if (!_defaultSkillRegistry) {
    _defaultSkillRegistry = new SkillRegistry();
    _defaultSkillRegistry.registerAll(CORE_SKILLS);
  }
  return _defaultSkillRegistry;
}

/**
 * Reset the default skill registry (useful for testing).
 */
export function resetDefaultSkillRegistry(): void {
  _defaultSkillRegistry = null;
}
