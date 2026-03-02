/**
 * Registry Types — shared types for the skill registry system.
 *
 * Defines the core types used across the registry, persistence,
 * and event modules.
 *
 * @module skills/registryTypes
 */

import type { NSID } from './nsid';
import type { PatternSkill } from './types';
import type { CommunitySkillMetadata } from './communityFormat';

/**
 * Where the skill originated.
 * - 'core': Bundled with OpenClo (immutable)
 * - 'community': Installed from marketplace
 * - 'local': Imported from local file
 */
export type SkillSource = 'core' | 'community' | 'local';

/**
 * A skill registered in the unified registry.
 *
 * Wraps a PatternSkill with metadata about its origin,
 * version, and enabled state.
 */
export interface RegisteredSkill {
  /** Unique namespace identifier (author:slug) */
  nsid: NSID;
  /** Where the skill came from */
  source: SkillSource;
  /** Semver version string */
  version: string;
  /** SHA-256 checksum for integrity verification */
  checksum: string;
  /** Unix timestamp when installed */
  installedAt: number;
  /** Unix timestamp when last updated */
  updatedAt: number;
  /** Whether the skill is currently active */
  enabled: boolean;
  /** The actual pattern skill definition */
  skill: PatternSkill;
  /** Community metadata (for community/local skills) */
  metadata?: CommunitySkillMetadata;
}

/**
 * User preference for resolving trigger conflicts.
 *
 * When multiple skills match the same trigger, this stores
 * which skill the user prefers.
 */
export interface TriggerPreference {
  /** The trigger phrase */
  trigger: string;
  /** The preferred skill's NSID */
  preferredNsid: NSID;
}
