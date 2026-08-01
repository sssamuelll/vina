/**
 * Extended edge-case tests for marketplace.
 *
 * Covers: fetch with mocked responses, query parameter handling,
 * invalid JSON responses, filtering invalid skills, localStorage corruption,
 * multiple skill installations.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getSkillRegistryUrl,
  setSkillRegistryUrl,
  fetchAvailableSkills,
  installSkill,
  uninstallSkill,
  isSkillInstalled,
  loadInstalledCommunitySkills,
  getInstalledSkillsAsPatternSkills,
  resetMarketplace,
} from '../action/skills/marketplace';
import type { CommunitySkill } from '../action/skills/communityFormat';
import { COMMUNITY_SKILL_SCHEMA_VERSION } from '../action/skills/communityFormat';

// ─── Mock localStorage ──────────────────────────────────────────────────────
const store: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value; },
  removeItem: (key: string) => { delete store[key]; },
  get length() { return Object.keys(store).length; },
  key: (index: number) => Object.keys(store)[index] ?? null,
  clear: () => { for (const key of Object.keys(store)) delete store[key]; },
};
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });

// ─── Helpers ────────────────────────────────────────────────────────────────

function validCommunitySkill(id: string = 'com.test.skill-1'): CommunitySkill {
  return {
    schemaVersion: COMMUNITY_SKILL_SCHEMA_VERSION,
    metadata: {
      id,
      name: 'Test Skill',
      version: '1.0.0',
      author: 'Test Author',
      description: 'A test skill',
      tags: ['test'],
      license: 'MIT',
    },
    skill: {
      name: `skill-${id}`,
      triggers: ['test-skill'],
      description: 'A test pattern skill',
      methods: [{
        name: 'Default',
        origin: 'US',
        description: 'Default method',
        formulas: {},
      }],
      formulas: {},
      easeTable: {},
      constructionSteps: [
        { order: 1, instruction: 'Step 1', toolCalls: [] },
      ],
    },
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Skill Marketplace — edge cases', () => {
  beforeEach(() => {
    resetMarketplace();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('fetchAvailableSkills — mocked responses', () => {
    it('should fetch and return valid skills', async () => {
      setSkillRegistryUrl('https://registry.example.com/skills.json');
      const skills = [validCommunitySkill('com.test.s1'), validCommunitySkill('com.test.s2')];

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => skills,
      } as unknown as Response);

      const result = await fetchAvailableSkills();
      expect(result).toHaveLength(2);
      expect(result[0].metadata.id).toBe('com.test.s1');
    });

    it('should filter out invalid skills from response', async () => {
      setSkillRegistryUrl('https://registry.example.com/skills.json');
      const skills = [
        validCommunitySkill('com.test.valid'),
        { schemaVersion: '', metadata: {}, skill: {} }, // invalid
        validCommunitySkill('com.test.valid2'),
      ];

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => skills,
      } as unknown as Response);

      const result = await fetchAvailableSkills();
      expect(result).toHaveLength(2);
    });

    it('should append query parameter to URL', async () => {
      setSkillRegistryUrl('https://registry.example.com/skills.json');
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      } as unknown as Response);

      await fetchAvailableSkills('bodice');
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://registry.example.com/skills.json?query=bodice',
      );
    });

    it('should append query with & if URL already has params', async () => {
      setSkillRegistryUrl('https://registry.example.com/skills.json?version=1');
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      } as unknown as Response);

      await fetchAvailableSkills('skirt');
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://registry.example.com/skills.json?version=1&query=skirt',
      );
    });

    it('should throw when response is not ok', async () => {
      setSkillRegistryUrl('https://registry.example.com/skills.json');
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 404,
      } as unknown as Response);

      await expect(fetchAvailableSkills()).rejects.toThrow('HTTP 404');
    });

    it('should throw when response is not valid JSON', async () => {
      setSkillRegistryUrl('https://registry.example.com/skills.json');
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => { throw new Error('bad json'); },
      } as unknown as Response);

      await expect(fetchAvailableSkills()).rejects.toThrow('invalid JSON');
    });

    it('should throw when response is not an array', async () => {
      setSkillRegistryUrl('https://registry.example.com/skills.json');
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ not: 'an array' }),
      } as unknown as Response);

      await expect(fetchAvailableSkills()).rejects.toThrow('JSON array');
    });

    it('should throw on network error', async () => {
      setSkillRegistryUrl('https://registry.example.com/skills.json');
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network failed'));

      await expect(fetchAvailableSkills()).rejects.toThrow('Network failed');
    });
  });

  describe('localStorage corruption for installed skills', () => {
    it('should return empty array for corrupt JSON', () => {
      localStorage.setItem('vina_installed_community_skills', '{corrupt');
      expect(loadInstalledCommunitySkills()).toEqual([]);
    });

    it('should return empty array for non-array JSON', () => {
      localStorage.setItem('vina_installed_community_skills', '"string"');
      expect(loadInstalledCommunitySkills()).toEqual([]);
    });

    it('should return empty array for null JSON', () => {
      localStorage.setItem('vina_installed_community_skills', 'null');
      expect(loadInstalledCommunitySkills()).toEqual([]);
    });
  });

  describe('install multiple skills', () => {
    it('should install several skills and list them', () => {
      installSkill(validCommunitySkill('com.test.s1'));
      installSkill(validCommunitySkill('com.test.s2'));
      installSkill(validCommunitySkill('com.test.s3'));
      expect(loadInstalledCommunitySkills()).toHaveLength(3);
    });

    it('should uninstall one without affecting others', () => {
      installSkill(validCommunitySkill('com.test.s1'));
      installSkill(validCommunitySkill('com.test.s2'));
      uninstallSkill('com.test.s1');
      expect(loadInstalledCommunitySkills()).toHaveLength(1);
      expect(isSkillInstalled('com.test.s2')).toBe(true);
      expect(isSkillInstalled('com.test.s1')).toBe(false);
    });
  });

  describe('uninstall nonexistent skill', () => {
    it('should not throw and not affect existing skills', () => {
      installSkill(validCommunitySkill('com.test.s1'));
      expect(() => uninstallSkill('nonexistent')).not.toThrow();
      expect(loadInstalledCommunitySkills()).toHaveLength(1);
    });
  });

  describe('getInstalledSkillsAsPatternSkills — fidelity', () => {
    it('should extract PatternSkill objects from community skills', () => {
      installSkill(validCommunitySkill('com.test.s1'));
      const skills = getInstalledSkillsAsPatternSkills();
      expect(skills).toHaveLength(1);
      expect(skills[0].name).toBe('skill-com.test.s1');
      expect(skills[0].triggers).toEqual(['test-skill']);
      expect(skills[0].constructionSteps).toHaveLength(1);
    });
  });

  describe('registry URL edge cases', () => {
    it('should handle setting empty URL', () => {
      setSkillRegistryUrl('https://example.com');
      setSkillRegistryUrl('');
      expect(getSkillRegistryUrl()).toBe('');
    });

    it('should throw when fetching with empty registry URL', async () => {
      await expect(fetchAvailableSkills()).rejects.toThrow('not configured');
    });
  });
});
