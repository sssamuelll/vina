/**
 * Skill Marketplace — discovery and installation of community skills.
 *
 * Provides an interface ready for a future real marketplace API while
 * currently supporting a static JSON registry that can be hosted anywhere
 * (GitHub, CDN, etc.).
 *
 * @module skills/marketplace
 */

import type { CommunitySkill } from './communityFormat';
import { validateCommunitySkill } from './communityFormat';
import type { PatternSkill } from './types';
import { safeGetItem, safeSetItem, safeRemoveItem } from '../../../utils/safeStorage';

// ─── Configuration ──────────────────────────────────────────────────────────

/** localStorage key for the skill registry URL */
const REGISTRY_URL_KEY = 'vina_skill_registry_url';

/** localStorage key for installed community skills */
const INSTALLED_SKILLS_KEY = 'vina_installed_community_skills';

/**
 * Get the configured skill registry URL.
 *
 * @returns The registry URL, or empty string if not configured
 */
export function getSkillRegistryUrl(): string {
  return safeGetItem(REGISTRY_URL_KEY) ?? '';
}

/**
 * Set the skill registry URL.
 *
 * @param url - The registry URL (empty string to disable community features)
 */
export function setSkillRegistryUrl(url: string): void {
  safeSetItem(REGISTRY_URL_KEY, url);
}

// ─── Fetching ───────────────────────────────────────────────────────────────

/**
 * Fetch available community skills from the configured registry.
 *
 * The registry is expected to return a JSON array of CommunitySkill objects
 * (or be filterable via a `?query=` parameter).
 *
 * @param query - Optional search query to filter results
 * @returns Array of available community skills
 * @throws Error if registry URL is not configured or fetch fails
 */
export async function fetchAvailableSkills(query?: string): Promise<CommunitySkill[]> {
  const baseUrl = getSkillRegistryUrl();
  if (!baseUrl) {
    throw new Error('Skill registry URL is not configured. Set it in Settings to enable community skills.');
  }

  const url = query
    ? `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}query=${encodeURIComponent(query)}`
    : baseUrl;

  let response: Response;
  try {
    response = await fetch(url);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to fetch skill registry: ${msg}`);
  }

  if (!response.ok) {
    throw new Error(`Skill registry returned HTTP ${response.status}`);
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error('Skill registry returned invalid JSON');
  }

  if (!Array.isArray(data)) {
    throw new Error('Skill registry must return a JSON array');
  }

  // Validate each skill and filter out invalid ones
  const validSkills: CommunitySkill[] = [];
  for (const item of data) {
    const validation = validateCommunitySkill(item as CommunitySkill);
    if (validation.valid) {
      validSkills.push(item as CommunitySkill);
    }
  }

  return validSkills;
}

// ─── Local Installation ─────────────────────────────────────────────────────

/**
 * Load the list of locally installed community skills from localStorage.
 *
 * @returns Array of installed CommunitySkill objects
 */
export function loadInstalledCommunitySkills(): CommunitySkill[] {
  try {
    const raw = safeGetItem(INSTALLED_SKILLS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as CommunitySkill[];
  } catch {
    return [];
  }
}

/**
 * Save the list of installed community skills to localStorage.
 *
 * @param skills - Array of CommunitySkill objects to persist
 */
function saveInstalledCommunitySkills(skills: CommunitySkill[]): void {
  safeSetItem(INSTALLED_SKILLS_KEY, JSON.stringify(skills));
}

/**
 * Install a community skill locally.
 *
 * Validates the skill, checks for duplicates, and persists to localStorage.
 *
 * @param skill - The community skill to install
 * @throws Error if skill is invalid or already installed
 */
export function installSkill(skill: CommunitySkill): void {
  const validation = validateCommunitySkill(skill);
  if (!validation.valid) {
    throw new Error(`Cannot install invalid skill: ${validation.errors.join('; ')}`);
  }

  const installed = loadInstalledCommunitySkills();
  if (installed.some(s => s.metadata.id === skill.metadata.id)) {
    throw new Error(`Skill "${skill.metadata.id}" is already installed`);
  }

  installed.push(skill);
  saveInstalledCommunitySkills(installed);
}

/**
 * Uninstall a community skill by its metadata id.
 *
 * @param skillId - The skill's metadata.id to remove
 */
export function uninstallSkill(skillId: string): void {
  const installed = loadInstalledCommunitySkills();
  const filtered = installed.filter(s => s.metadata.id !== skillId);
  saveInstalledCommunitySkills(filtered);
}

/**
 * Check if a community skill is installed.
 *
 * @param skillId - The skill's metadata.id
 * @returns true if installed
 */
export function isSkillInstalled(skillId: string): boolean {
  return loadInstalledCommunitySkills().some(s => s.metadata.id === skillId);
}

/**
 * Get all installed community skills as PatternSkills for use in the skill registry.
 *
 * @returns Array of PatternSkill objects extracted from installed community skills
 */
export function getInstalledSkillsAsPatternSkills(): PatternSkill[] {
  return loadInstalledCommunitySkills().map(cs => cs.skill);
}

/**
 * Reset marketplace state (for testing).
 */
export function resetMarketplace(): void {
  safeRemoveItem(REGISTRY_URL_KEY);
  safeRemoveItem(INSTALLED_SKILLS_KEY);
}
