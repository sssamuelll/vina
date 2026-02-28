/**
 * Skills Module — public API
 *
 * @module skills
 */

// Core types
export type { NSID, ParsedNSID, NSIDValidationResult } from './nsid';
export type { SkillSource, RegisteredSkill, TriggerPreference } from './registryTypes';
export type { PatternSkill, Formula, DraftingMethod, ConstructionStep, SkillGradeRule } from './types';
export type { CommunitySkill, CommunitySkillMetadata } from './communityFormat';
export type { SkillEvent, SkillEventHandler } from './skillEvents';
export type { ValidationResult } from './skillValidator';

// NSID utilities
export { isValidNSID, parseNSID, createNSID, validateNSID } from './nsid';

// Registry
export { SkillRegistry, resetSkillRegistry, getDefaultSkillRegistry } from './skillRegistry';
export {
  InvalidNSIDError,
  SkillValidationError,
  DuplicateSkillError,
  CoreSkillProtectedError,
} from './skillRegistry';

// Core skills
export { CORE_SKILLS, CORE_NSIDS, isCoreSkill } from './coreSkills';

// Skill loader (for copilot)
export { loadSkill, getRelevantSkills, buildSkillContext } from './skillLoader';

// Marketplace
export {
  fetchAvailableSkills,
  installSkill,
  uninstallSkill,
  isSkillInstalled,
} from './marketplace';

// Seamly2D converter
export { parseSeamlyXML } from './seamlyParser';
export type { SeamlyPattern, SeamlyConstructionStep, SeamlyPiece } from './seamlyParser';
export { generateInstruction, getToolCalls } from './instructionGenerator';
export { convertSeamlyToSkill, generateTriggers, inferTags } from './seamlyToSkill';
export type { ImportValidation, ConversionResult } from './seamlyToSkill';
