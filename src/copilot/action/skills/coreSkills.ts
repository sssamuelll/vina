/**
 * Core Skills — bundled skills with NSID identifiers.
 *
 * All skills that ship with OpenClo are defined here with their
 * namespace identifiers for the unified registry.
 *
 * DORMANT (M2, #847): these skills encode real drafting formulas but are NOT
 * wired to the AgenticLoop — `getRelevantSkills()` / `buildSkillContext()` are
 * never called, so the agent never sees or executes them. Retained as the
 * head-start for agent-driven parametric drafting (#243, post-M2). Do not treat
 * as live behavior.
 *
 * @module skills/coreSkills
 */

import type { NSID } from './nsid';
import type { RegisteredSkill } from './registryTypes';
import { bodiceSkill } from './definitions/bodiceSkill';
import { sleeveSkill } from './definitions/sleeveSkill';
import { skirtSkill } from './definitions/skirtSkill';
import { collarSkill } from './definitions/collarSkill';
import { gradingSkill } from './definitions/gradingSkill';

/** Core skill NSIDs */
export const CORE_NSIDS = {
  BODICE: 'openclo:bodice' as NSID,
  SLEEVE: 'openclo:sleeve' as NSID,
  SKIRT: 'openclo:skirt' as NSID,
  COLLAR: 'openclo:collar' as NSID,
  GRADING: 'openclo:grading' as NSID,
} as const;

/** All core NSIDs as a set for fast lookup */
export const CORE_NSID_SET = new Set(Object.values(CORE_NSIDS));

/**
 * Check if an NSID is a core skill.
 */
export function isCoreSkill(nsid: NSID): boolean {
  return CORE_NSID_SET.has(nsid);
}

/**
 * Build a RegisteredSkill from a core skill.
 */
function coreToRegistered(nsid: NSID, skill: typeof bodiceSkill): RegisteredSkill {
  return {
    nsid,
    source: 'core',
    version: '1.0.0',
    checksum: '', // Core skills don't need checksum
    installedAt: 0,
    updatedAt: 0,
    enabled: true,
    skill,
  };
}

/** All core skills as RegisteredSkill objects */
export const CORE_SKILLS: RegisteredSkill[] = [
  coreToRegistered(CORE_NSIDS.BODICE, bodiceSkill),
  coreToRegistered(CORE_NSIDS.SLEEVE, sleeveSkill),
  coreToRegistered(CORE_NSIDS.SKIRT, skirtSkill),
  coreToRegistered(CORE_NSIDS.COLLAR, collarSkill),
  coreToRegistered(CORE_NSIDS.GRADING, gradingSkill),
];
