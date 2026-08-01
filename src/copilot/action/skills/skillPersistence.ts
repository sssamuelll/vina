/**
 * Skill Persistence — IndexedDB storage for community skills.
 *
 * Provides persistent storage for installed community skills and
 * user preferences for trigger conflict resolution.
 *
 * @module skills/skillPersistence
 */

import type { NSID } from './nsid';
import { normalizeLegacyNSID, denormalizeToLegacyNSID } from './nsid';
import type { RegisteredSkill, TriggerPreference } from './registryTypes';
import { safeGetItem, safeRemoveItem } from '../../../utils/safeStorage';

const DB_NAME = 'vina_skills_v1';
const DB_VERSION = 1;
const SKILLS_STORE = 'skills';
const PREFERENCES_STORE = 'preferences';

/**
 * IndexedDB persistence layer for skills.
 *
 * @example
 * const persistence = new SkillPersistence();
 * await persistence.open();
 *
 * await persistence.saveSkill(skill);
 * const loaded = await persistence.getAllSkills();
 *
 * await persistence.close();
 */
export class SkillPersistence {
  private db: IDBDatabase | null = null;

  /**
   * Open the database connection.
   */
  async open(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Skills store
        if (!db.objectStoreNames.contains(SKILLS_STORE)) {
          const skillsStore = db.createObjectStore(SKILLS_STORE, { keyPath: 'nsid' });
          skillsStore.createIndex('source', 'source', { unique: false });
          skillsStore.createIndex('enabled', 'enabled', { unique: false });
          skillsStore.createIndex('installedAt', 'installedAt', { unique: false });
        }

        // Preferences store
        if (!db.objectStoreNames.contains(PREFERENCES_STORE)) {
          db.createObjectStore(PREFERENCES_STORE, { keyPath: 'trigger' });
        }
      };
    });
  }

  /**
   * Close the database connection.
   */
  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  /**
   * Clear all data (for testing).
   */
  async clear(): Promise<void> {
    if (!this.db) return;
    const tx = this.db.transaction([SKILLS_STORE, PREFERENCES_STORE], 'readwrite');
    tx.objectStore(SKILLS_STORE).clear();
    tx.objectStore(PREFERENCES_STORE).clear();
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  private ensureOpen(): IDBDatabase {
    if (!this.db) {
      throw new Error('SkillPersistence not open. Call open() first.');
    }
    return this.db;
  }

  // ─── Skills CRUD ─────────────────────────────────────────────────────────

  /**
   * Save or update a skill.
   */
  async saveSkill(skill: RegisteredSkill): Promise<void> {
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SKILLS_STORE, 'readwrite');
      tx.objectStore(SKILLS_STORE).put(skill);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Look up a skill record by its exact stored key (no legacy fallback).
   */
  private async getSkillByExactKey(key: string): Promise<RegisteredSkill | undefined> {
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SKILLS_STORE, 'readonly');
      const request = tx.objectStore(SKILLS_STORE).get(key);
      request.onsuccess = () => resolve(request.result ?? undefined);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get a skill by NSID.
   *
   * Falls back to the legacy form of the NSID when the canonical key misses:
   * `cloneDb` (renameMigration.ts) copies the `skills` store verbatim, so a
   * skill cloned from the pre-rename DB may still be keyed under its
   * `openclo:*` NSID even though `getAllSkills()` normalizes it to `vina:*`
   * on read. Without this, a lookup/delete by the canonical NSID silently
   * misses the legacy-keyed record (IMPORTANT #4, 2026-08-01 final review).
   */
  async getSkill(nsid: NSID): Promise<RegisteredSkill | undefined> {
    const direct = await this.getSkillByExactKey(nsid);
    if (direct) return direct;
    const legacyKey = denormalizeToLegacyNSID(nsid);
    if (legacyKey === null) return undefined;
    return this.getSkillByExactKey(legacyKey);
  }

  /**
   * Get all saved skills.
   */
  async getAllSkills(): Promise<RegisteredSkill[]> {
    const db = this.ensureOpen();
    const skills = await new Promise<RegisteredSkill[]>((resolve, reject) => {
      const tx = db.transaction(SKILLS_STORE, 'readonly');
      const request = tx.objectStore(SKILLS_STORE).getAll();
      request.onsuccess = () => resolve(request.result ?? []);
      request.onerror = () => reject(request.error);
    });
    // Alias legacy 'openclo:*' NSIDs read from disk to 'vina:*' — see normalizeLegacyNSID.
    return skills.map(s => ({ ...s, nsid: normalizeLegacyNSID(s.nsid) as NSID }));
  }

  /**
   * Delete a skill by NSID.
   * @returns true if deleted, false if not found
   */
  async deleteSkill(nsid: NSID): Promise<boolean> {
    const db = this.ensureOpen();
    const existing = await this.getSkill(nsid);
    if (!existing) return false;
    // Delete whichever key the record actually lives under — for a
    // legacy-keyed clone (see getSkill's fallback), that's `existing.nsid`
    // (the raw, unnormalized stored key), not the canonical `nsid` param.
    const actualKey = existing.nsid;

    return new Promise((resolve, reject) => {
      const tx = db.transaction(SKILLS_STORE, 'readwrite');
      tx.objectStore(SKILLS_STORE).delete(actualKey);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  // ─── Preferences ─────────────────────────────────────────────────────────

  /**
   * Set a trigger preference (which skill handles a trigger).
   */
  async setPreference(trigger: string, nsid: NSID): Promise<void> {
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(PREFERENCES_STORE, 'readwrite');
      tx.objectStore(PREFERENCES_STORE).put({ trigger, preferredNsid: nsid });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Get the preferred skill for a trigger.
   */
  async getPreference(trigger: string): Promise<NSID | undefined> {
    const db = this.ensureOpen();
    const preferredNsid = await new Promise<NSID | undefined>((resolve, reject) => {
      const tx = db.transaction(PREFERENCES_STORE, 'readonly');
      const request = tx.objectStore(PREFERENCES_STORE).get(trigger);
      request.onsuccess = () => resolve(request.result?.preferredNsid);
      request.onerror = () => reject(request.error);
    });
    // Alias legacy 'openclo:*' NSIDs read from disk to 'vina:*' — see normalizeLegacyNSID.
    return preferredNsid ? (normalizeLegacyNSID(preferredNsid) as NSID) : undefined;
  }

  /**
   * Get all trigger preferences.
   */
  async getAllPreferences(): Promise<TriggerPreference[]> {
    const db = this.ensureOpen();
    const prefs = await new Promise<TriggerPreference[]>((resolve, reject) => {
      const tx = db.transaction(PREFERENCES_STORE, 'readonly');
      const request = tx.objectStore(PREFERENCES_STORE).getAll();
      request.onsuccess = () => resolve(request.result ?? []);
      request.onerror = () => reject(request.error);
    });
    // Alias legacy 'openclo:*' NSIDs read from disk to 'vina:*' — see normalizeLegacyNSID.
    return prefs.map(p => ({ ...p, preferredNsid: normalizeLegacyNSID(p.preferredNsid) as NSID }));
  }

  // ─── Migration ───────────────────────────────────────────────────────────

  /**
   * Migrate skills from legacy localStorage to this DB. Domain-specific
   * naming intentional — distinct from the canonical migrateFromLocalStorage
   * helper in storage.ts (BUG-10 / B6-state § 3.6).
   * @returns Number of skills migrated
   */
  async migrateLegacySkills(): Promise<number> {
    const INSTALLED_SKILLS_KEY = 'vina_installed_community_skills';
    let count = 0;

    try {
      const raw = safeGetItem(INSTALLED_SKILLS_KEY);
      if (!raw) return 0;

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return 0;

      for (const cs of parsed) {
        if (cs.metadata?.id && cs.skill) {
          const registered: RegisteredSkill = {
            // Normalize at write: the store's keyPath is 'nsid', so a raw legacy
            // id here would persist under the old key forever (getAllSkills
            // masks it on read, but deleteSkill('vina-...') would silently miss).
            nsid: normalizeLegacyNSID(cs.metadata.id) as NSID,
            source: 'community',
            version: cs.metadata.version || '1.0.0',
            checksum: '',
            installedAt: Date.now(),
            updatedAt: Date.now(),
            enabled: true,
            skill: cs.skill,
            metadata: cs.metadata,
          };
          await this.saveSkill(registered);
          count++;
        }
      }

      // Clear old storage after successful migration
      safeRemoveItem(INSTALLED_SKILLS_KEY);
    } catch {
      // Migration failure is non-fatal
    }

    return count;
  }
}
