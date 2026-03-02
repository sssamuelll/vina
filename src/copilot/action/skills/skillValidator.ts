/**
 * Skill Validator — validation and checksum computation for skills.
 *
 * Validates PatternSkill and CommunitySkill structures, and computes
 * SHA-256 checksums for integrity verification.
 *
 * @module skills/skillValidator
 */

import type { PatternSkill } from './types';
import type { CommunitySkill } from './communityFormat';

/**
 * Validation result with errors and warnings.
 */
export interface ValidationResult {
  /** Whether validation passed */
  valid: boolean;
  /** Error messages (validation failures) */
  errors: string[];
  /** Warning messages (non-fatal issues) */
  warnings: string[];
}

/**
 * Validates skills and computes checksums.
 */
export class SkillValidator {
  /**
   * Validate a PatternSkill for structural correctness.
   *
   * Checks that all required fields are present and properly typed.
   *
   * @param skill - The pattern skill to validate
   * @returns Validation result
   */
  validatePatternSkill(skill: PatternSkill): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Name
    if (!skill.name || typeof skill.name !== 'string' || !skill.name.trim()) {
      errors.push('Skill must have a non-empty string "name"');
    }

    // Triggers
    if (!Array.isArray(skill.triggers) || skill.triggers.length === 0) {
      errors.push('Skill must have a non-empty "triggers" array');
    } else {
      for (let i = 0; i < skill.triggers.length; i++) {
        if (typeof skill.triggers[i] !== 'string' || !skill.triggers[i].trim()) {
          errors.push(`Trigger[${i}] must be a non-empty string`);
        }
      }
    }

    // Description
    if (!skill.description || typeof skill.description !== 'string' || !skill.description.trim()) {
      errors.push('Skill must have a non-empty string "description"');
    }

    // Methods
    if (!Array.isArray(skill.methods) || skill.methods.length === 0) {
      errors.push('Skill must have at least one drafting method');
    } else {
      for (let i = 0; i < skill.methods.length; i++) {
        const m = skill.methods[i];
        if (!m.name || !m.name.trim()) {
          errors.push(`Method[${i}] must have a non-empty "name"`);
        }
        if (!m.origin || !m.origin.trim()) {
          errors.push(`Method[${i}] must have a non-empty "origin"`);
        }
        if (!m.description || !m.description.trim()) {
          errors.push(`Method[${i}] must have a non-empty "description"`);
        }
      }
    }

    // Formulas (can be empty object, but must exist)
    if (!skill.formulas || typeof skill.formulas !== 'object') {
      errors.push('Skill must have a "formulas" object');
    }

    // Ease table (can be empty object, but must exist)
    if (!skill.easeTable || typeof skill.easeTable !== 'object') {
      errors.push('Skill must have an "easeTable" object');
    }

    // Construction steps
    if (!Array.isArray(skill.constructionSteps) || skill.constructionSteps.length === 0) {
      errors.push('Skill must have non-empty "constructionSteps"');
    } else {
      for (let i = 0; i < skill.constructionSteps.length; i++) {
        const step = skill.constructionSteps[i];
        if (typeof step.order !== 'number') {
          errors.push(`ConstructionStep[${i}] must have a numeric "order"`);
        }
        if (!step.instruction || !step.instruction.trim()) {
          errors.push(`ConstructionStep[${i}] must have a non-empty "instruction"`);
        }
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Validate a CommunitySkill for completeness.
   *
   * Validates both the metadata and the nested PatternSkill.
   *
   * @param communitySkill - The community skill to validate
   * @returns Validation result
   */
  validateCommunitySkill(communitySkill: CommunitySkill): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Schema version
    if (!communitySkill.schemaVersion || typeof communitySkill.schemaVersion !== 'string') {
      errors.push('Missing or invalid "schemaVersion"');
    }

    // Metadata
    if (!communitySkill.metadata) {
      errors.push('Missing "metadata" object');
    } else {
      const meta = communitySkill.metadata;

      if (!meta.id || typeof meta.id !== 'string' || !meta.id.trim()) {
        errors.push('Metadata must have a non-empty "id"');
      }
      if (!meta.name || typeof meta.name !== 'string' || !meta.name.trim()) {
        errors.push('Metadata must have a non-empty "name"');
      }
      if (!meta.version || typeof meta.version !== 'string' || !meta.version.trim()) {
        errors.push('Metadata must have a non-empty "version"');
      }
      if (!meta.author || typeof meta.author !== 'string' || !meta.author.trim()) {
        errors.push('Metadata must have a non-empty "author"');
      }
      if (!meta.description || typeof meta.description !== 'string' || !meta.description.trim()) {
        errors.push('Metadata must have a non-empty "description"');
      }
      if (!Array.isArray(meta.tags)) {
        errors.push('Metadata must have a "tags" array');
      }
      if (!meta.license || typeof meta.license !== 'string' || !meta.license.trim()) {
        errors.push('Metadata must have a non-empty "license"');
      }
    }

    // Skill definition
    if (!communitySkill.skill) {
      errors.push('Missing "skill" object');
    } else {
      const skillResult = this.validatePatternSkill(communitySkill.skill);
      errors.push(...skillResult.errors);
      warnings.push(...skillResult.warnings);
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Compute SHA-256 checksum of a PatternSkill.
   *
   * The checksum is deterministic: same skill data always produces
   * the same checksum, regardless of property declaration order.
   *
   * @param skill - The pattern skill to checksum
   * @returns Hex-encoded SHA-256 hash (64 characters)
   */
  async computeChecksum(skill: PatternSkill): Promise<string> {
    // Sort keys for deterministic output
    const json = JSON.stringify(skill, this.sortedReplacer);
    const encoder = new TextEncoder();
    const data = encoder.encode(json);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * JSON replacer that sorts object keys for deterministic serialization.
   */
  private sortedReplacer(_key: string, value: unknown): unknown {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.keys(value as Record<string, unknown>)
        .sort()
        .reduce((sorted, key) => {
          sorted[key] = (value as Record<string, unknown>)[key];
          return sorted;
        }, {} as Record<string, unknown>);
    }
    return value;
  }
}
