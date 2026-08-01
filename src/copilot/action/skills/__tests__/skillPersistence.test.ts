/**
 * Tests for Skill Persistence (IndexedDB).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SkillPersistence } from '../skillPersistence';
import type { RegisteredSkill } from '../registryTypes';
import type { NSID } from '../nsid';
import { safeSetItem } from '../../../../utils/safeStorage';

// Mock IndexedDB using fake-indexeddb
import 'fake-indexeddb/auto';

const mockSkill: RegisteredSkill = {
  nsid: 'test:skill' as NSID,
  source: 'community',
  version: '1.0.0',
  checksum: 'abc123',
  installedAt: Date.now(),
  updatedAt: Date.now(),
  enabled: true,
  skill: {
    name: 'skill',
    triggers: ['test'],
    description: 'Test skill',
    methods: [{ name: 'Default', origin: 'US', description: 'Default', formulas: {} }],
    formulas: {},
    easeTable: {},
    constructionSteps: [{ order: 1, instruction: 'Step 1', toolCalls: [] }],
  },
};

describe('SkillPersistence', () => {
  let persistence: SkillPersistence;

  beforeEach(async () => {
    persistence = new SkillPersistence();
    await persistence.open();
  });

  afterEach(async () => {
    await persistence.clear();
    await persistence.close();
  });

  describe('saveSkill / getSkill', () => {
    it('saves and retrieves a skill', async () => {
      await persistence.saveSkill(mockSkill);
      const retrieved = await persistence.getSkill('test:skill' as NSID);
      expect(retrieved).toBeDefined();
      expect(retrieved!.nsid).toBe('test:skill');
    });

    it('returns undefined for non-existent skill', async () => {
      const retrieved = await persistence.getSkill('nonexistent:skill' as NSID);
      expect(retrieved).toBeUndefined();
    });
  });

  describe('getAllSkills', () => {
    it('returns all saved skills', async () => {
      await persistence.saveSkill(mockSkill);
      await persistence.saveSkill({ ...mockSkill, nsid: 'test:skill2' as NSID });
      const all = await persistence.getAllSkills();
      expect(all).toHaveLength(2);
    });

    it('returns empty array when no skills', async () => {
      const all = await persistence.getAllSkills();
      expect(all).toEqual([]);
    });

    it('normalizes a legacy openclo NSID in the installed skills list', async () => {
      await persistence.saveSkill({ ...mockSkill, nsid: 'openclo-community:pleats' as NSID });
      const all = await persistence.getAllSkills();
      expect(all.map(s => s.nsid)).toContain('vina-community:pleats');
    });
  });

  describe('deleteSkill', () => {
    it('deletes an existing skill', async () => {
      await persistence.saveSkill(mockSkill);
      const deleted = await persistence.deleteSkill('test:skill' as NSID);
      expect(deleted).toBe(true);
      const retrieved = await persistence.getSkill('test:skill' as NSID);
      expect(retrieved).toBeUndefined();
    });

    it('returns false for non-existent skill', async () => {
      const deleted = await persistence.deleteSkill('nonexistent:skill' as NSID);
      expect(deleted).toBe(false);
    });
  });

  describe('preferences', () => {
    it('saves and retrieves preference', async () => {
      await persistence.setPreference('bodice', 'sdar:bodice' as NSID);
      const pref = await persistence.getPreference('bodice');
      expect(pref).toBe('sdar:bodice');
    });

    it('returns undefined for non-existent preference', async () => {
      const pref = await persistence.getPreference('nonexistent');
      expect(pref).toBeUndefined();
    });

    it('normalizes a legacy openclo NSID read from preferences', async () => {
      await persistence.setPreference('bodice', 'openclo:bodice' as NSID);
      const pref = await persistence.getPreference('bodice');
      expect(pref).toBe('vina:bodice');
    });

    it('getAllPreferences returns all preferences', async () => {
      await persistence.setPreference('bodice', 'sdar:bodice' as NSID);
      await persistence.setPreference('skirt', 'vina:skirt' as NSID);
      const all = await persistence.getAllPreferences();
      expect(all).toHaveLength(2);
    });

    it('normalizes a legacy openclo NSID in getAllPreferences', async () => {
      await persistence.setPreference('skirt', 'openclo:skirt' as NSID);
      const all = await persistence.getAllPreferences();
      expect(all.find(p => p.trigger === 'skirt')?.preferredNsid).toBe('vina:skirt');
    });
  });

  describe('migrateLegacySkills', () => {
    it('normalizes a legacy openclo-community NSID at write time so deleteSkill can find it', async () => {
      safeSetItem('vina_installed_community_skills', JSON.stringify([
        { metadata: { id: 'openclo-community:pleats', version: '1.0.0' }, skill: mockSkill.skill },
      ]));

      const count = await persistence.migrateLegacySkills();
      expect(count).toBe(1);

      const all = await persistence.getAllSkills();
      expect(all.map(s => s.nsid)).toContain('vina-community:pleats');

      // The real bug: if the legacy id was written raw, the IDB record's key
      // (keyPath: 'nsid') stays 'openclo-community:pleats' and a delete by the
      // normalized id silently finds nothing.
      const deleted = await persistence.deleteSkill('vina-community:pleats' as NSID);
      expect(deleted).toBe(true);
    });
  });
});
