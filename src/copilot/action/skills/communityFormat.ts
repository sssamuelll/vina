/**
 * Community Skill Format — standard format for sharable pattern-making skills.
 *
 * Defines the CommunitySkill interface for skills contributed by the community,
 * with metadata for discovery, versioning, and attribution. Provides
 * serialization and validation for import/export workflows.
 *
 * @module skills/communityFormat
 */

import type { PatternSkill } from './types';

// ─── Types ──────────────────────────────────────────────────────────────────

/** Metadata for a community-contributed skill */
export interface CommunitySkillMetadata {
  /** Unique skill identifier (reverse-domain recommended) */
  id: string;
  /** Display name */
  name: string;
  /** Semver version string */
  version: string;
  /** Author name or handle */
  author: string;
  /** Description (ideally bilingual ES/EN) */
  description: string;
  /** Discovery tags (e.g. ["bodice", "advanced", "couture"]) */
  tags: string[];
  /** License identifier (e.g. "MIT", "CC-BY-4.0") */
  license: string;
}

/** Community metadata for published skills */
export interface CommunityStats {
  /** Number of times downloaded */
  downloads?: number;
  /** Average rating (1-5) */
  rating?: number;
  /** Number of reviews */
  reviewCount?: number;
}

/**
 * A complete community skill package — metadata + PatternSkill + community stats.
 */
export interface CommunitySkill {
  /** Schema version for forward compatibility */
  schemaVersion: string;
  /** Skill metadata */
  metadata: CommunitySkillMetadata;
  /** The actual pattern skill definition */
  skill: PatternSkill;
  /** Community usage statistics (optional, populated by marketplace) */
  stats?: CommunityStats;
}

/**
 * Result of validating a community skill.
 */
export interface CommunitySkillValidation {
  /** Whether validation passed */
  valid: boolean;
  /** Error messages */
  errors: string[];
  /** Non-fatal warnings */
  warnings: string[];
}

/** Current schema version for community skills */
export const COMMUNITY_SKILL_SCHEMA_VERSION = '1.0.0';

// ─── Validation ─────────────────────────────────────────────────────────────

/**
 * Validate a PatternSkill object for structural correctness.
 *
 * @param skill - The pattern skill to validate
 * @returns Array of error messages (empty if valid)
 */
function validatePatternSkill(skill: PatternSkill): string[] {
  const errors: string[] = [];

  if (!skill.name || typeof skill.name !== 'string') {
    errors.push('Skill must have a string "name"');
  }
  if (!Array.isArray(skill.triggers) || skill.triggers.length === 0) {
    errors.push('Skill must have a non-empty "triggers" array');
  }
  if (!skill.description || typeof skill.description !== 'string') {
    errors.push('Skill must have a string "description"');
  }
  if (!Array.isArray(skill.methods) || skill.methods.length === 0) {
    errors.push('Skill must have at least one drafting method');
  } else {
    for (let i = 0; i < skill.methods.length; i++) {
      const m = skill.methods[i];
      if (!m.name || !m.origin || !m.description) {
        errors.push(`Method[${i}] must have name, origin, and description`);
      }
    }
  }
  if (!skill.formulas || typeof skill.formulas !== 'object') {
    errors.push('Skill must have a "formulas" object');
  }
  if (!skill.easeTable || typeof skill.easeTable !== 'object') {
    errors.push('Skill must have an "easeTable" object');
  }
  if (!Array.isArray(skill.constructionSteps) || skill.constructionSteps.length === 0) {
    errors.push('Skill must have non-empty "constructionSteps"');
  } else {
    for (let i = 0; i < skill.constructionSteps.length; i++) {
      const step = skill.constructionSteps[i];
      if (typeof step.order !== 'number' || !step.instruction) {
        errors.push(`ConstructionStep[${i}] must have order (number) and instruction (string)`);
      }
    }
  }

  return errors;
}

/**
 * Validate a CommunitySkill for completeness and correctness.
 *
 * Checks metadata, skill content, and schema version.
 *
 * @param communitySkill - The community skill to validate
 * @returns Validation result with errors and warnings
 */
export function validateCommunitySkill(communitySkill: CommunitySkill): CommunitySkillValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Schema version
  if (!communitySkill.schemaVersion) {
    errors.push('Missing "schemaVersion"');
  } else if (communitySkill.schemaVersion !== COMMUNITY_SKILL_SCHEMA_VERSION) {
    warnings.push(
      `Schema version "${communitySkill.schemaVersion}" differs from current "${COMMUNITY_SKILL_SCHEMA_VERSION}"`,
    );
  }

  // Metadata validation
  const meta = communitySkill.metadata;
  if (!meta) {
    errors.push('Missing "metadata" object');
  } else {
    if (!meta.id || typeof meta.id !== 'string') errors.push('Metadata must have a string "id"');
    if (!meta.name || typeof meta.name !== 'string') errors.push('Metadata must have a string "name"');
    if (!meta.version || typeof meta.version !== 'string') errors.push('Metadata must have a string "version"');
    if (!meta.author || typeof meta.author !== 'string') errors.push('Metadata must have a string "author"');
    if (!meta.description || typeof meta.description !== 'string') errors.push('Metadata must have a string "description"');
    if (!Array.isArray(meta.tags)) errors.push('Metadata must have a "tags" array');
    if (!meta.license || typeof meta.license !== 'string') errors.push('Metadata must have a string "license"');
  }

  // Skill validation
  if (!communitySkill.skill) {
    errors.push('Missing "skill" object');
  } else {
    const skillErrors = validatePatternSkill(communitySkill.skill);
    errors.push(...skillErrors);
  }

  // Stats validation (optional)
  if (communitySkill.stats) {
    if (communitySkill.stats.rating !== undefined) {
      if (typeof communitySkill.stats.rating !== 'number' ||
          communitySkill.stats.rating < 0 || communitySkill.stats.rating > 5) {
        warnings.push('Stats rating should be a number between 0 and 5');
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ─── Export / Import ────────────────────────────────────────────────────────

/**
 * Export a PatternSkill to a shareable CommunitySkill JSON string.
 *
 * @param skill - The pattern skill to export
 * @param metadata - Community metadata (id, name, author, etc.)
 * @param stats - Optional community statistics
 * @returns Serialized JSON string
 */
export function exportSkill(
  skill: PatternSkill,
  metadata: CommunitySkillMetadata,
  stats?: CommunityStats,
): string {
  const communitySkill: CommunitySkill = {
    schemaVersion: COMMUNITY_SKILL_SCHEMA_VERSION,
    metadata,
    skill,
    stats,
  };

  const validation = validateCommunitySkill(communitySkill);
  if (!validation.valid) {
    throw new Error(`Cannot export invalid skill: ${validation.errors.join('; ')}`);
  }

  return JSON.stringify(communitySkill, null, 2);
}

/**
 * Import a CommunitySkill from a JSON string.
 *
 * Parses and validates the JSON, returning the CommunitySkill object.
 *
 * @param json - JSON string to parse
 * @returns The parsed and validated CommunitySkill
 * @throws Error if JSON is invalid or skill fails validation
 */
export function importSkill(json: string): CommunitySkill {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('Invalid JSON: failed to parse community skill');
  }

  const communitySkill = parsed as CommunitySkill;
  const validation = validateCommunitySkill(communitySkill);
  if (!validation.valid) {
    throw new Error(`Invalid community skill: ${validation.errors.join('; ')}`);
  }

  return communitySkill;
}

/**
 * Convert a CommunitySkill to a JSON string.
 *
 * @param communitySkill - The community skill to serialize
 * @returns JSON string
 */
export function communitySkillToJSON(communitySkill: CommunitySkill): string {
  return JSON.stringify(communitySkill, null, 2);
}

/**
 * Parse a CommunitySkill from a JSON string without validation.
 *
 * @param json - JSON string to parse
 * @returns The parsed CommunitySkill
 * @throws Error if JSON is invalid
 */
export function communitySkillFromJSON(json: string): CommunitySkill {
  try {
    return JSON.parse(json) as CommunitySkill;
  } catch {
    throw new Error('Invalid JSON: failed to parse community skill');
  }
}
