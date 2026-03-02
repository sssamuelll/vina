import { describe, it, expect, beforeEach } from 'vitest';
import {
  getSkillRegistryUrl,
  setSkillRegistryUrl,
  installSkill,
  uninstallSkill,
  isSkillInstalled,
  loadInstalledCommunitySkills,
  getInstalledSkillsAsPatternSkills,
  resetMarketplace,
  fetchAvailableSkills,
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
      triggers: ['test-skill', 'test skill'],
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

describe('Skill Marketplace', () => {
  beforeEach(() => {
    resetMarketplace();
    localStorage.clear();
  });

  describe('registry URL', () => {
    it('should return empty string when not configured', () => {
      expect(getSkillRegistryUrl()).toBe('');
    });

    it('should set and get registry URL', () => {
      setSkillRegistryUrl('https://registry.example.com/skills.json');
      expect(getSkillRegistryUrl()).toBe('https://registry.example.com/skills.json');
    });
  });

  describe('installSkill', () => {
    it('should install a valid community skill', () => {
      installSkill(validCommunitySkill());
      expect(loadInstalledCommunitySkills()).toHaveLength(1);
    });

    it('should reject duplicate installation', () => {
      installSkill(validCommunitySkill());
      expect(() => installSkill(validCommunitySkill())).toThrow('already installed');
    });

    it('should reject invalid skill', () => {
      const bad = { ...validCommunitySkill(), schemaVersion: '' };
      expect(() => installSkill(bad)).toThrow();
    });
  });

  describe('uninstallSkill', () => {
    it('should remove an installed skill', () => {
      installSkill(validCommunitySkill());
      uninstallSkill('com.test.skill-1');
      expect(loadInstalledCommunitySkills()).toHaveLength(0);
    });

    it('should handle uninstalling non-existent skill', () => {
      expect(() => uninstallSkill('nonexistent')).not.toThrow();
    });
  });

  describe('isSkillInstalled', () => {
    it('should return true for installed skill', () => {
      installSkill(validCommunitySkill());
      expect(isSkillInstalled('com.test.skill-1')).toBe(true);
    });

    it('should return false for non-installed skill', () => {
      expect(isSkillInstalled('com.test.skill-1')).toBe(false);
    });
  });

  describe('getInstalledSkillsAsPatternSkills', () => {
    it('should return PatternSkills from installed community skills', () => {
      installSkill(validCommunitySkill('com.test.s1'));
      installSkill(validCommunitySkill('com.test.s2'));
      const skills = getInstalledSkillsAsPatternSkills();
      expect(skills).toHaveLength(2);
      expect(skills[0].name).toBe('skill-com.test.s1');
    });

    it('should return empty array when none installed', () => {
      expect(getInstalledSkillsAsPatternSkills()).toHaveLength(0);
    });
  });

  describe('fetchAvailableSkills', () => {
    it('should throw when registry URL is not configured', async () => {
      await expect(fetchAvailableSkills()).rejects.toThrow('not configured');
    });

    it('should throw on network error', async () => {
      setSkillRegistryUrl('https://registry.example.com/skills.json');
      // fetch will fail in test environment
      await expect(fetchAvailableSkills()).rejects.toThrow();
    });
  });
});
