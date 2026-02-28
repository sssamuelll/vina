# Unified SkillRegistry Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform SkillRegistry into a unified, IndexedDB-backed system with NSID support for dynamic community skill loading.

**Architecture:** Singleton SkillRegistry owns all skills (core + community). IndexedDB persists community skills. In-memory trigger index for fast lookups. Event emitter for UI reactivity.

**Tech Stack:** TypeScript, IndexedDB (native API), Vitest, SHA-256 (Web Crypto API)

**Design Doc:** `docs/plans/2026-02-28-skill-registry-unified-design.md`

---

## Task 1: NSID Module

**Files:**
- Create: `src/copilot/skills/nsid.ts`
- Create: `src/copilot/skills/__tests__/nsid.test.ts`

### Step 1: Write the failing tests

```typescript
// src/copilot/skills/__tests__/nsid.test.ts
import { describe, it, expect } from 'vitest';
import {
  type NSID,
  parseNSID,
  validateNSID,
  createNSID,
  isValidNSID,
} from '../nsid';

describe('nsid', () => {
  describe('isValidNSID', () => {
    it('returns true for valid NSID format', () => {
      expect(isValidNSID('openclo:bodice')).toBe(true);
      expect(isValidNSID('sdar:stretch_bodice')).toBe(true);
      expect(isValidNSID('user123:my-skill')).toBe(true);
    });

    it('returns false for invalid formats', () => {
      expect(isValidNSID('nobodice')).toBe(false);
      expect(isValidNSID(':bodice')).toBe(false);
      expect(isValidNSID('openclo:')).toBe(false);
      expect(isValidNSID('')).toBe(false);
      expect(isValidNSID('a:b:c')).toBe(false);
    });
  });

  describe('parseNSID', () => {
    it('parses valid NSID into components', () => {
      const parsed = parseNSID('openclo:bodice');
      expect(parsed.author).toBe('openclo');
      expect(parsed.slug).toBe('bodice');
      expect(parsed.full).toBe('openclo:bodice');
    });

    it('throws for invalid NSID', () => {
      expect(() => parseNSID('invalid')).toThrow('Invalid NSID');
    });
  });

  describe('createNSID', () => {
    it('creates NSID from author and slug', () => {
      const nsid = createNSID('openclo', 'bodice');
      expect(nsid).toBe('openclo:bodice');
    });

    it('throws for empty author', () => {
      expect(() => createNSID('', 'bodice')).toThrow();
    });

    it('throws for empty slug', () => {
      expect(() => createNSID('openclo', '')).toThrow();
    });
  });

  describe('validateNSID', () => {
    it('returns valid result for correct NSID', () => {
      const result = validateNSID('openclo:bodice');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('returns errors for invalid NSID', () => {
      const result = validateNSID('invalid');
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});
```

### Step 2: Run test to verify it fails

Run: `npm test -- --run src/copilot/skills/__tests__/nsid.test.ts`
Expected: FAIL with "Cannot find module '../nsid'"

### Step 3: Write minimal implementation

```typescript
// src/copilot/skills/nsid.ts
/**
 * NSID (Namespace Identifier) — unique skill identification.
 *
 * Format: "author:slug" e.g. "openclo:bodice", "sdar:stretch_bodice"
 *
 * @module skills/nsid
 */

/** NSID template literal type */
export type NSID = `${string}:${string}`;

/** Parsed NSID components */
export interface ParsedNSID {
  author: string;
  slug: string;
  full: NSID;
}

/** Validation result */
export interface NSIDValidationResult {
  valid: boolean;
  errors: string[];
}

/** NSID format regex: author:slug, both non-empty, no additional colons */
const NSID_REGEX = /^([a-z0-9_-]+):([a-z0-9_-]+)$/i;

/**
 * Check if a string is a valid NSID format.
 */
export function isValidNSID(value: string): value is NSID {
  return NSID_REGEX.test(value);
}

/**
 * Parse an NSID string into its components.
 * @throws Error if NSID is invalid
 */
export function parseNSID(nsid: string): ParsedNSID {
  const match = nsid.match(NSID_REGEX);
  if (!match) {
    throw new Error(`Invalid NSID format: "${nsid}". Expected "author:slug".`);
  }
  return {
    author: match[1],
    slug: match[2],
    full: nsid as NSID,
  };
}

/**
 * Create an NSID from author and slug.
 * @throws Error if author or slug is empty
 */
export function createNSID(author: string, slug: string): NSID {
  if (!author || !author.trim()) {
    throw new Error('NSID author cannot be empty');
  }
  if (!slug || !slug.trim()) {
    throw new Error('NSID slug cannot be empty');
  }
  const nsid = `${author}:${slug}`;
  if (!isValidNSID(nsid)) {
    throw new Error(`Invalid NSID components: author="${author}", slug="${slug}"`);
  }
  return nsid as NSID;
}

/**
 * Validate an NSID and return detailed results.
 */
export function validateNSID(nsid: string): NSIDValidationResult {
  const errors: string[] = [];

  if (!nsid || typeof nsid !== 'string') {
    errors.push('NSID must be a non-empty string');
    return { valid: false, errors };
  }

  if (!nsid.includes(':')) {
    errors.push('NSID must contain a colon separator (format: "author:slug")');
    return { valid: false, errors };
  }

  const parts = nsid.split(':');
  if (parts.length !== 2) {
    errors.push('NSID must have exactly one colon (format: "author:slug")');
    return { valid: false, errors };
  }

  const [author, slug] = parts;
  if (!author) {
    errors.push('NSID author (before colon) cannot be empty');
  }
  if (!slug) {
    errors.push('NSID slug (after colon) cannot be empty');
  }

  if (!NSID_REGEX.test(nsid)) {
    errors.push('NSID must contain only alphanumeric characters, hyphens, and underscores');
  }

  return { valid: errors.length === 0, errors };
}
```

### Step 4: Run test to verify it passes

Run: `npm test -- --run src/copilot/skills/__tests__/nsid.test.ts`
Expected: PASS

### Step 5: Commit

```bash
git add src/copilot/skills/nsid.ts src/copilot/skills/__tests__/nsid.test.ts
git commit -m "feat(skills): add NSID module for namespace identification"
```

---

## Task 2: Skill Events Module

**Files:**
- Create: `src/copilot/skills/skillEvents.ts`
- Create: `src/copilot/skills/__tests__/skillEvents.test.ts`

### Step 1: Write the failing tests

```typescript
// src/copilot/skills/__tests__/skillEvents.test.ts
import { describe, it, expect, vi } from 'vitest';
import { SkillEventEmitter, type SkillEvent } from '../skillEvents';

describe('SkillEventEmitter', () => {
  it('emits events to registered handlers', () => {
    const emitter = new SkillEventEmitter();
    const handler = vi.fn();

    emitter.on('skill:registered', handler);
    emitter.emit('skill:registered', 'openclo:bodice');

    expect(handler).toHaveBeenCalledWith('openclo:bodice', undefined);
  });

  it('supports multiple handlers for same event', () => {
    const emitter = new SkillEventEmitter();
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    emitter.on('skill:registered', handler1);
    emitter.on('skill:registered', handler2);
    emitter.emit('skill:registered', 'openclo:bodice');

    expect(handler1).toHaveBeenCalled();
    expect(handler2).toHaveBeenCalled();
  });

  it('returns unsubscribe function', () => {
    const emitter = new SkillEventEmitter();
    const handler = vi.fn();

    const unsubscribe = emitter.on('skill:registered', handler);
    unsubscribe();
    emitter.emit('skill:registered', 'openclo:bodice');

    expect(handler).not.toHaveBeenCalled();
  });

  it('passes skill data to handlers', () => {
    const emitter = new SkillEventEmitter();
    const handler = vi.fn();
    const skillData = { nsid: 'openclo:bodice' };

    emitter.on('skill:registered', handler);
    emitter.emit('skill:registered', 'openclo:bodice', skillData);

    expect(handler).toHaveBeenCalledWith('openclo:bodice', skillData);
  });

  it('handles all event types', () => {
    const emitter = new SkillEventEmitter();
    const events: SkillEvent[] = [
      'skill:registered',
      'skill:unregistered',
      'skill:enabled',
      'skill:disabled',
      'skill:updated',
    ];

    for (const event of events) {
      const handler = vi.fn();
      emitter.on(event, handler);
      emitter.emit(event, 'test:skill');
      expect(handler).toHaveBeenCalled();
    }
  });
});
```

### Step 2: Run test to verify it fails

Run: `npm test -- --run src/copilot/skills/__tests__/skillEvents.test.ts`
Expected: FAIL with "Cannot find module '../skillEvents'"

### Step 3: Write minimal implementation

```typescript
// src/copilot/skills/skillEvents.ts
/**
 * Skill Event Emitter — pub/sub for skill lifecycle events.
 *
 * @module skills/skillEvents
 */

import type { NSID } from './nsid';
import type { RegisteredSkill } from './registryTypes';

/** Skill lifecycle events */
export type SkillEvent =
  | 'skill:registered'
  | 'skill:unregistered'
  | 'skill:enabled'
  | 'skill:disabled'
  | 'skill:updated';

/** Event handler signature */
export type SkillEventHandler = (nsid: NSID, skill?: RegisteredSkill | unknown) => void;

/**
 * Event emitter for skill lifecycle events.
 */
export class SkillEventEmitter {
  private handlers: Map<SkillEvent, Set<SkillEventHandler>> = new Map();

  /**
   * Subscribe to a skill event.
   * @returns Unsubscribe function
   */
  on(event: SkillEvent, handler: SkillEventHandler): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);

    return () => {
      this.handlers.get(event)?.delete(handler);
    };
  }

  /**
   * Emit an event to all registered handlers.
   */
  emit(event: SkillEvent, nsid: NSID, skill?: RegisteredSkill | unknown): void {
    const eventHandlers = this.handlers.get(event);
    if (eventHandlers) {
      for (const handler of eventHandlers) {
        try {
          handler(nsid, skill);
        } catch (error) {
          console.error(`[SkillEvents] Handler error for ${event}:`, error);
        }
      }
    }
  }

  /**
   * Remove all handlers for an event (or all events if no event specified).
   */
  clear(event?: SkillEvent): void {
    if (event) {
      this.handlers.delete(event);
    } else {
      this.handlers.clear();
    }
  }
}
```

### Step 4: Create registryTypes.ts for shared types

```typescript
// src/copilot/skills/registryTypes.ts
/**
 * Registry Types — shared types for skill registry system.
 *
 * @module skills/registryTypes
 */

import type { NSID } from './nsid';
import type { PatternSkill } from './types';
import type { CommunitySkillMetadata } from './communityFormat';

/** Where the skill originated */
export type SkillSource = 'core' | 'community' | 'local';

/** A skill registered in the unified registry */
export interface RegisteredSkill {
  nsid: NSID;
  source: SkillSource;
  version: string;
  checksum: string;
  installedAt: number;
  updatedAt: number;
  enabled: boolean;
  skill: PatternSkill;
  metadata?: CommunitySkillMetadata;
}

/** User preference for trigger conflicts */
export interface TriggerPreference {
  trigger: string;
  preferredNsid: NSID;
}
```

### Step 5: Run test to verify it passes

Run: `npm test -- --run src/copilot/skills/__tests__/skillEvents.test.ts`
Expected: PASS

### Step 6: Commit

```bash
git add src/copilot/skills/skillEvents.ts src/copilot/skills/registryTypes.ts src/copilot/skills/__tests__/skillEvents.test.ts
git commit -m "feat(skills): add SkillEventEmitter for lifecycle events"
```

---

## Task 3: Skill Validator Module

**Files:**
- Create: `src/copilot/skills/skillValidator.ts`
- Create: `src/copilot/skills/__tests__/skillValidator.test.ts`

### Step 1: Write the failing tests

```typescript
// src/copilot/skills/__tests__/skillValidator.test.ts
import { describe, it, expect } from 'vitest';
import { SkillValidator } from '../skillValidator';
import type { PatternSkill } from '../types';
import type { CommunitySkill } from '../communityFormat';
import { COMMUNITY_SKILL_SCHEMA_VERSION } from '../communityFormat';

const validPatternSkill: PatternSkill = {
  name: 'test-skill',
  triggers: ['test', 'testing'],
  description: 'A test skill',
  methods: [{
    name: 'Default',
    origin: 'US',
    description: 'Default method',
    formulas: { width: 'chest / 4' },
  }],
  formulas: {
    width: {
      name: 'Width',
      expression: 'chest / 4',
      description: 'Quarter chest',
      variables: ['chest'],
      unit: 'cm',
    },
  },
  easeTable: { woven: { chest: 4 } },
  constructionSteps: [{
    order: 1,
    instruction: 'Draw rectangle',
    toolCalls: ['drawRect'],
  }],
};

describe('SkillValidator', () => {
  const validator = new SkillValidator();

  describe('validatePatternSkill', () => {
    it('validates a correct PatternSkill', () => {
      const result = validator.validatePatternSkill(validPatternSkill);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects skill without name', () => {
      const skill = { ...validPatternSkill, name: '' };
      const result = validator.validatePatternSkill(skill);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('name'))).toBe(true);
    });

    it('rejects skill without triggers', () => {
      const skill = { ...validPatternSkill, triggers: [] };
      const result = validator.validatePatternSkill(skill);
      expect(result.valid).toBe(false);
    });
  });

  describe('validateCommunitySkill', () => {
    const validCommunitySkill: CommunitySkill = {
      schemaVersion: COMMUNITY_SKILL_SCHEMA_VERSION,
      metadata: {
        id: 'test:skill',
        name: 'Test Skill',
        version: '1.0.0',
        author: 'Test Author',
        description: 'Test description',
        tags: ['test'],
        license: 'MIT',
      },
      skill: validPatternSkill,
    };

    it('validates a correct CommunitySkill', () => {
      const result = validator.validateCommunitySkill(validCommunitySkill);
      expect(result.valid).toBe(true);
    });

    it('rejects skill without metadata', () => {
      const skill = { ...validCommunitySkill, metadata: undefined } as unknown as CommunitySkill;
      const result = validator.validateCommunitySkill(skill);
      expect(result.valid).toBe(false);
    });
  });

  describe('computeChecksum', () => {
    it('returns consistent checksum for same skill', async () => {
      const checksum1 = await validator.computeChecksum(validPatternSkill);
      const checksum2 = await validator.computeChecksum(validPatternSkill);
      expect(checksum1).toBe(checksum2);
    });

    it('returns different checksum for different skills', async () => {
      const modified = { ...validPatternSkill, name: 'different-name' };
      const checksum1 = await validator.computeChecksum(validPatternSkill);
      const checksum2 = await validator.computeChecksum(modified);
      expect(checksum1).not.toBe(checksum2);
    });

    it('returns hex string', async () => {
      const checksum = await validator.computeChecksum(validPatternSkill);
      expect(checksum).toMatch(/^[a-f0-9]+$/);
    });
  });
});
```

### Step 2: Run test to verify it fails

Run: `npm test -- --run src/copilot/skills/__tests__/skillValidator.test.ts`
Expected: FAIL

### Step 3: Write minimal implementation

```typescript
// src/copilot/skills/skillValidator.ts
/**
 * Skill Validator — validation and checksum for skills.
 *
 * @module skills/skillValidator
 */

import type { PatternSkill } from './types';
import type { CommunitySkill } from './communityFormat';

/** Validation result */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validates skills and computes checksums.
 */
export class SkillValidator {
  /**
   * Validate a PatternSkill for structural correctness.
   */
  validatePatternSkill(skill: PatternSkill): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!skill.name || typeof skill.name !== 'string') {
      errors.push('Skill must have a non-empty string "name"');
    }
    if (!Array.isArray(skill.triggers) || skill.triggers.length === 0) {
      errors.push('Skill must have a non-empty "triggers" array');
    }
    if (!skill.description || typeof skill.description !== 'string') {
      errors.push('Skill must have a non-empty string "description"');
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
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Validate a CommunitySkill for completeness.
   */
  validateCommunitySkill(communitySkill: CommunitySkill): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!communitySkill.schemaVersion) {
      errors.push('Missing "schemaVersion"');
    }

    if (!communitySkill.metadata) {
      errors.push('Missing "metadata" object');
    } else {
      const meta = communitySkill.metadata;
      if (!meta.id) errors.push('Metadata must have "id"');
      if (!meta.name) errors.push('Metadata must have "name"');
      if (!meta.version) errors.push('Metadata must have "version"');
      if (!meta.author) errors.push('Metadata must have "author"');
      if (!meta.description) errors.push('Metadata must have "description"');
      if (!Array.isArray(meta.tags)) errors.push('Metadata must have "tags" array');
      if (!meta.license) errors.push('Metadata must have "license"');
    }

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
   */
  async computeChecksum(skill: PatternSkill): Promise<string> {
    const json = JSON.stringify(skill, Object.keys(skill).sort());
    const encoder = new TextEncoder();
    const data = encoder.encode(json);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
}
```

### Step 4: Run test to verify it passes

Run: `npm test -- --run src/copilot/skills/__tests__/skillValidator.test.ts`
Expected: PASS

### Step 5: Commit

```bash
git add src/copilot/skills/skillValidator.ts src/copilot/skills/__tests__/skillValidator.test.ts
git commit -m "feat(skills): add SkillValidator with checksum support"
```

---

## Task 4: Skill Persistence Module (IndexedDB)

**Files:**
- Create: `src/copilot/skills/skillPersistence.ts`
- Create: `src/copilot/skills/__tests__/skillPersistence.test.ts`

### Step 1: Write the failing tests

```typescript
// src/copilot/skills/__tests__/skillPersistence.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SkillPersistence } from '../skillPersistence';
import type { RegisteredSkill } from '../registryTypes';
import type { NSID } from '../nsid';

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

    it('getAllPreferences returns all preferences', async () => {
      await persistence.setPreference('bodice', 'sdar:bodice' as NSID);
      await persistence.setPreference('skirt', 'openclo:skirt' as NSID);
      const all = await persistence.getAllPreferences();
      expect(all).toHaveLength(2);
    });
  });
});
```

### Step 2: Install fake-indexeddb for testing

Run: `npm install -D fake-indexeddb`

### Step 3: Run test to verify it fails

Run: `npm test -- --run src/copilot/skills/__tests__/skillPersistence.test.ts`
Expected: FAIL with "Cannot find module '../skillPersistence'"

### Step 4: Write minimal implementation

```typescript
// src/copilot/skills/skillPersistence.ts
/**
 * Skill Persistence — IndexedDB storage for community skills.
 *
 * @module skills/skillPersistence
 */

import type { NSID } from './nsid';
import type { RegisteredSkill, TriggerPreference } from './registryTypes';

const DB_NAME = 'openclo_skills_v1';
const DB_VERSION = 1;
const SKILLS_STORE = 'skills';
const PREFERENCES_STORE = 'preferences';

/**
 * IndexedDB persistence layer for skills.
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

  async saveSkill(skill: RegisteredSkill): Promise<void> {
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SKILLS_STORE, 'readwrite');
      tx.objectStore(SKILLS_STORE).put(skill);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getSkill(nsid: NSID): Promise<RegisteredSkill | undefined> {
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SKILLS_STORE, 'readonly');
      const request = tx.objectStore(SKILLS_STORE).get(nsid);
      request.onsuccess = () => resolve(request.result ?? undefined);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllSkills(): Promise<RegisteredSkill[]> {
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SKILLS_STORE, 'readonly');
      const request = tx.objectStore(SKILLS_STORE).getAll();
      request.onsuccess = () => resolve(request.result ?? []);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteSkill(nsid: NSID): Promise<boolean> {
    const db = this.ensureOpen();
    const exists = await this.getSkill(nsid);
    if (!exists) return false;

    return new Promise((resolve, reject) => {
      const tx = db.transaction(SKILLS_STORE, 'readwrite');
      tx.objectStore(SKILLS_STORE).delete(nsid);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  // ─── Preferences ─────────────────────────────────────────────────────────

  async setPreference(trigger: string, nsid: NSID): Promise<void> {
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(PREFERENCES_STORE, 'readwrite');
      tx.objectStore(PREFERENCES_STORE).put({ trigger, preferredNsid: nsid });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getPreference(trigger: string): Promise<NSID | undefined> {
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(PREFERENCES_STORE, 'readonly');
      const request = tx.objectStore(PREFERENCES_STORE).get(trigger);
      request.onsuccess = () => resolve(request.result?.preferredNsid);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllPreferences(): Promise<TriggerPreference[]> {
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(PREFERENCES_STORE, 'readonly');
      const request = tx.objectStore(PREFERENCES_STORE).getAll();
      request.onsuccess = () => resolve(request.result ?? []);
      request.onerror = () => reject(request.error);
    });
  }

  // ─── Migration ───────────────────────────────────────────────────────────

  async migrateFromLocalStorage(): Promise<number> {
    const INSTALLED_SKILLS_KEY = 'openclo_installed_community_skills';
    let count = 0;

    try {
      const raw = localStorage.getItem(INSTALLED_SKILLS_KEY);
      if (!raw) return 0;

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return 0;

      for (const cs of parsed) {
        if (cs.metadata?.id && cs.skill) {
          const registered: RegisteredSkill = {
            nsid: cs.metadata.id as NSID,
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
      localStorage.removeItem(INSTALLED_SKILLS_KEY);
    } catch {
      // Migration failure is non-fatal
    }

    return count;
  }
}
```

### Step 5: Run test to verify it passes

Run: `npm test -- --run src/copilot/skills/__tests__/skillPersistence.test.ts`
Expected: PASS

### Step 6: Commit

```bash
git add src/copilot/skills/skillPersistence.ts src/copilot/skills/__tests__/skillPersistence.test.ts package.json package-lock.json
git commit -m "feat(skills): add SkillPersistence with IndexedDB storage"
```

---

## Task 5: Core Skills with NSIDs

**Files:**
- Create: `src/copilot/skills/coreSkills.ts`
- Modify: `src/copilot/skills/definitions/bodiceSkill.ts` (add NSID export)

### Step 1: Create coreSkills.ts

```typescript
// src/copilot/skills/coreSkills.ts
/**
 * Core Skills — bundled skills with NSID identifiers.
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
```

### Step 2: Commit

```bash
git add src/copilot/skills/coreSkills.ts
git commit -m "feat(skills): add coreSkills module with NSID mappings"
```

---

## Task 6: Unified SkillRegistry

**Files:**
- Rewrite: `src/copilot/skills/skillRegistry.ts`
- Create: `src/copilot/skills/__tests__/skillRegistry.unified.test.ts`

### Step 1: Write the failing tests

```typescript
// src/copilot/skills/__tests__/skillRegistry.unified.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';

// Reset modules to get fresh singleton
beforeEach(() => {
  vi.resetModules();
});

describe('SkillRegistry (Unified)', () => {
  let SkillRegistry: typeof import('../skillRegistry').SkillRegistry;
  let resetSkillRegistry: typeof import('../skillRegistry').resetSkillRegistry;

  beforeEach(async () => {
    const module = await import('../skillRegistry');
    SkillRegistry = module.SkillRegistry;
    resetSkillRegistry = module.resetSkillRegistry;
  });

  afterEach(async () => {
    await resetSkillRegistry();
  });

  describe('getInstance / initialize', () => {
    it('returns singleton instance', () => {
      const instance1 = SkillRegistry.getInstance();
      const instance2 = SkillRegistry.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('loads core skills on initialize', async () => {
      const registry = SkillRegistry.getInstance();
      await registry.initialize();
      expect(registry.has('openclo:bodice')).toBe(true);
      expect(registry.has('openclo:sleeve')).toBe(true);
      expect(registry.coreCount).toBe(5);
    });
  });

  describe('register / unregister', () => {
    it('registers a community skill', async () => {
      const registry = SkillRegistry.getInstance();
      await registry.initialize();

      const nsid = await registry.registerFromJSON(JSON.stringify({
        schemaVersion: '1.0.0',
        metadata: {
          id: 'test:skill',
          name: 'Test',
          version: '1.0.0',
          author: 'Test',
          description: 'Test',
          tags: [],
          license: 'MIT',
        },
        skill: {
          name: 'test',
          triggers: ['test trigger'],
          description: 'Test',
          methods: [{ name: 'Default', origin: 'US', description: 'Default', formulas: {} }],
          formulas: {},
          easeTable: {},
          constructionSteps: [{ order: 1, instruction: 'Step', toolCalls: [] }],
        },
      }));

      expect(nsid).toBe('test:skill');
      expect(registry.has('test:skill')).toBe(true);
    });

    it('throws when unregistering core skill', async () => {
      const registry = SkillRegistry.getInstance();
      await registry.initialize();
      await expect(registry.unregister('openclo:bodice')).rejects.toThrow('core');
    });
  });

  describe('findByTrigger', () => {
    it('finds skill by trigger phrase', async () => {
      const registry = SkillRegistry.getInstance();
      await registry.initialize();
      const skill = registry.findByTrigger('bodice');
      expect(skill).toBeDefined();
      expect(skill!.nsid).toBe('openclo:bodice');
    });

    it('returns undefined for unknown trigger', async () => {
      const registry = SkillRegistry.getInstance();
      await registry.initialize();
      const skill = registry.findByTrigger('xyznonexistent');
      expect(skill).toBeUndefined();
    });
  });

  describe('events', () => {
    it('emits skill:registered event', async () => {
      const registry = SkillRegistry.getInstance();
      await registry.initialize();

      const handler = vi.fn();
      registry.on('skill:registered', handler);

      await registry.registerFromJSON(JSON.stringify({
        schemaVersion: '1.0.0',
        metadata: { id: 'event:test', name: 'Test', version: '1.0.0', author: 'T', description: 'T', tags: [], license: 'MIT' },
        skill: { name: 'test', triggers: ['evt'], description: 'T', methods: [{ name: 'D', origin: 'US', description: 'D', formulas: {} }], formulas: {}, easeTable: {}, constructionSteps: [{ order: 1, instruction: 'S', toolCalls: [] }] },
      }));

      expect(handler).toHaveBeenCalledWith('event:test', expect.anything());
    });
  });

  describe('enable / disable', () => {
    it('disables and enables a skill', async () => {
      const registry = SkillRegistry.getInstance();
      await registry.initialize();

      await registry.disable('openclo:bodice');
      let skill = registry.get('openclo:bodice');
      expect(skill!.enabled).toBe(false);

      await registry.enable('openclo:bodice');
      skill = registry.get('openclo:bodice');
      expect(skill!.enabled).toBe(true);
    });
  });
});
```

### Step 2: Run test to verify it fails

Run: `npm test -- --run src/copilot/skills/__tests__/skillRegistry.unified.test.ts`
Expected: FAIL

### Step 3: Rewrite skillRegistry.ts

```typescript
// src/copilot/skills/skillRegistry.ts
/**
 * Unified Skill Registry — single source of truth for all skills.
 *
 * Manages core and community skills with IndexedDB persistence,
 * NSID-based identification, and event-driven updates.
 *
 * @module skills/skillRegistry
 */

import type { NSID } from './nsid';
import { parseNSID, isValidNSID } from './nsid';
import type { RegisteredSkill, SkillSource } from './registryTypes';
import type { CommunitySkill } from './communityFormat';
import type { PatternSkill } from './types';
import { SkillPersistence } from './skillPersistence';
import { SkillValidator } from './skillValidator';
import { SkillEventEmitter, type SkillEvent, type SkillEventHandler } from './skillEvents';
import { CORE_SKILLS, isCoreSkill } from './coreSkills';

// ─── Error Classes ─────────────────────────────────────────────────────────

export class InvalidNSIDError extends Error {
  constructor(nsid: string) {
    super(`Invalid NSID format: "${nsid}". Expected "author:slug".`);
    this.name = 'InvalidNSIDError';
  }
}

export class SkillValidationError extends Error {
  constructor(public errors: string[]) {
    super(`Skill validation failed: ${errors.join('; ')}`);
    this.name = 'SkillValidationError';
  }
}

export class DuplicateSkillError extends Error {
  constructor(nsid: NSID) {
    super(`Skill "${nsid}" is already registered`);
    this.name = 'DuplicateSkillError';
  }
}

export class CoreSkillProtectedError extends Error {
  constructor(nsid: NSID) {
    super(`Cannot unregister core skill "${nsid}"`);
    this.name = 'CoreSkillProtectedError';
  }
}

// ─── Unified Registry ──────────────────────────────────────────────────────

/**
 * Unified skill registry with persistence and events.
 */
export class SkillRegistry {
  private static instance: SkillRegistry | null = null;

  private skills: Map<NSID, RegisteredSkill> = new Map();
  private triggerIndex: Map<string, NSID[]> = new Map();
  private preferences: Map<string, NSID> = new Map();

  private persistence: SkillPersistence;
  private validator: SkillValidator;
  private events: SkillEventEmitter;

  private initialized = false;

  private constructor() {
    this.persistence = new SkillPersistence();
    this.validator = new SkillValidator();
    this.events = new SkillEventEmitter();
  }

  /**
   * Get the singleton instance.
   */
  static getInstance(): SkillRegistry {
    if (!SkillRegistry.instance) {
      SkillRegistry.instance = new SkillRegistry();
    }
    return SkillRegistry.instance;
  }

  /**
   * Initialize the registry: load core skills and persisted community skills.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Open persistence
    await this.persistence.open();

    // Migrate from localStorage if needed
    await this.persistence.migrateFromLocalStorage();

    // Load core skills
    for (const skill of CORE_SKILLS) {
      this.skills.set(skill.nsid, skill);
      this.indexTriggers(skill.nsid, skill.skill.triggers);
    }

    // Load persisted community skills
    const persisted = await this.persistence.getAllSkills();
    for (const skill of persisted) {
      this.skills.set(skill.nsid, skill);
      if (skill.enabled) {
        this.indexTriggers(skill.nsid, skill.skill.triggers);
      }
    }

    // Load preferences
    const prefs = await this.persistence.getAllPreferences();
    for (const pref of prefs) {
      this.preferences.set(pref.trigger, pref.preferredNsid);
    }

    this.initialized = true;
  }

  // ─── Registration ────────────────────────────────────────────────────────

  /**
   * Register a community skill from JSON string.
   */
  async registerFromJSON(json: string): Promise<NSID> {
    let parsed: CommunitySkill;
    try {
      parsed = JSON.parse(json) as CommunitySkill;
    } catch {
      throw new Error('Invalid JSON');
    }
    return this.register(parsed);
  }

  /**
   * Register a community skill.
   */
  async register(communitySkill: CommunitySkill, source: SkillSource = 'community'): Promise<NSID> {
    // Validate
    const validation = this.validator.validateCommunitySkill(communitySkill);
    if (!validation.valid) {
      throw new SkillValidationError(validation.errors);
    }

    // Parse NSID
    const nsidStr = communitySkill.metadata.id;
    if (!isValidNSID(nsidStr)) {
      throw new InvalidNSIDError(nsidStr);
    }
    const nsid = nsidStr as NSID;

    // Check duplicate
    if (this.skills.has(nsid)) {
      throw new DuplicateSkillError(nsid);
    }

    // Compute checksum
    const checksum = await this.validator.computeChecksum(communitySkill.skill);

    // Create registered skill
    const registered: RegisteredSkill = {
      nsid,
      source,
      version: communitySkill.metadata.version,
      checksum,
      installedAt: Date.now(),
      updatedAt: Date.now(),
      enabled: true,
      skill: communitySkill.skill,
      metadata: communitySkill.metadata,
    };

    // Save to memory and persistence
    this.skills.set(nsid, registered);
    this.indexTriggers(nsid, registered.skill.triggers);

    if (source !== 'core') {
      await this.persistence.saveSkill(registered);
    }

    // Emit event
    this.events.emit('skill:registered', nsid, registered);

    return nsid;
  }

  /**
   * Unregister a skill by NSID.
   */
  async unregister(nsid: NSID): Promise<boolean> {
    if (isCoreSkill(nsid)) {
      throw new CoreSkillProtectedError(nsid);
    }

    const skill = this.skills.get(nsid);
    if (!skill) return false;

    // Remove from memory
    this.skills.delete(nsid);
    this.removeTriggers(nsid, skill.skill.triggers);

    // Remove from persistence
    await this.persistence.deleteSkill(nsid);

    // Emit event
    this.events.emit('skill:unregistered', nsid);

    return true;
  }

  /**
   * Enable a skill.
   */
  async enable(nsid: NSID): Promise<void> {
    const skill = this.skills.get(nsid);
    if (!skill) return;

    skill.enabled = true;
    skill.updatedAt = Date.now();
    this.indexTriggers(nsid, skill.skill.triggers);

    if (!isCoreSkill(nsid)) {
      await this.persistence.saveSkill(skill);
    }

    this.events.emit('skill:enabled', nsid, skill);
  }

  /**
   * Disable a skill.
   */
  async disable(nsid: NSID): Promise<void> {
    const skill = this.skills.get(nsid);
    if (!skill) return;

    skill.enabled = false;
    skill.updatedAt = Date.now();
    this.removeTriggers(nsid, skill.skill.triggers);

    if (!isCoreSkill(nsid)) {
      await this.persistence.saveSkill(skill);
    }

    this.events.emit('skill:disabled', nsid, skill);
  }

  // ─── Queries ─────────────────────────────────────────────────────────────

  get(nsid: NSID): RegisteredSkill | undefined {
    return this.skills.get(nsid);
  }

  has(nsid: NSID | string): boolean {
    return this.skills.has(nsid as NSID);
  }

  getAll(): RegisteredSkill[] {
    return Array.from(this.skills.values());
  }

  getBySource(source: SkillSource): RegisteredSkill[] {
    return this.getAll().filter(s => s.source === source);
  }

  getEnabled(): RegisteredSkill[] {
    return this.getAll().filter(s => s.enabled);
  }

  get size(): number {
    return this.skills.size;
  }

  get coreCount(): number {
    return this.getBySource('core').length;
  }

  get communityCount(): number {
    return this.getBySource('community').length;
  }

  // ─── Trigger Matching ────────────────────────────────────────────────────

  /**
   * Find the best skill for a trigger phrase.
   */
  findByTrigger(phrase: string): RegisteredSkill | undefined {
    const normalized = phrase.toLowerCase();

    // Check exact trigger match
    const nsids = this.triggerIndex.get(normalized);
    if (!nsids || nsids.length === 0) {
      // Try partial match
      for (const [trigger, ids] of this.triggerIndex) {
        if (normalized.includes(trigger) && ids.length > 0) {
          // Check preference
          const preferred = this.preferences.get(trigger);
          if (preferred && ids.includes(preferred)) {
            return this.skills.get(preferred);
          }
          return this.skills.get(ids[0]);
        }
      }
      return undefined;
    }

    // Check preference
    const preferred = this.preferences.get(normalized);
    if (preferred && nsids.includes(preferred)) {
      return this.skills.get(preferred);
    }

    return this.skills.get(nsids[0]);
  }

  /**
   * Find all skills matching a trigger (for conflict detection).
   */
  findAllByTrigger(phrase: string): RegisteredSkill[] {
    const normalized = phrase.toLowerCase();
    const nsids = this.triggerIndex.get(normalized) ?? [];
    return nsids.map(nsid => this.skills.get(nsid)).filter((s): s is RegisteredSkill => !!s);
  }

  // ─── Conflict Resolution ─────────────────────────────────────────────────

  /**
   * Get all triggers with multiple competing skills.
   */
  getConflicts(): Map<string, NSID[]> {
    const conflicts = new Map<string, NSID[]>();
    for (const [trigger, nsids] of this.triggerIndex) {
      if (nsids.length > 1) {
        conflicts.set(trigger, [...nsids]);
      }
    }
    return conflicts;
  }

  /**
   * Set user preference for a trigger.
   */
  async setPreference(trigger: string, nsid: NSID): Promise<void> {
    this.preferences.set(trigger.toLowerCase(), nsid);
    await this.persistence.setPreference(trigger.toLowerCase(), nsid);
  }

  /**
   * Get user preference for a trigger.
   */
  getPreference(trigger: string): NSID | undefined {
    return this.preferences.get(trigger.toLowerCase());
  }

  // ─── Events ──────────────────────────────────────────────────────────────

  /**
   * Subscribe to skill events.
   */
  on(event: SkillEvent, handler: SkillEventHandler): () => void {
    return this.events.on(event, handler);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private indexTriggers(nsid: NSID, triggers: string[]): void {
    for (const trigger of triggers) {
      const key = trigger.toLowerCase();
      const existing = this.triggerIndex.get(key) ?? [];
      if (!existing.includes(nsid)) {
        existing.push(nsid);
        this.triggerIndex.set(key, existing);
      }
    }
  }

  private removeTriggers(nsid: NSID, triggers: string[]): void {
    for (const trigger of triggers) {
      const key = trigger.toLowerCase();
      const existing = this.triggerIndex.get(key);
      if (existing) {
        const filtered = existing.filter(n => n !== nsid);
        if (filtered.length === 0) {
          this.triggerIndex.delete(key);
        } else {
          this.triggerIndex.set(key, filtered);
        }
      }
    }
  }
}

// ─── Compatibility Exports ─────────────────────────────────────────────────

/**
 * Reset the singleton (for testing).
 */
export async function resetSkillRegistry(): Promise<void> {
  if (SkillRegistry['instance']) {
    const instance = SkillRegistry['instance'];
    await instance['persistence'].close();
    SkillRegistry['instance'] = null;
  }
}

/**
 * Get the default skill registry (compatibility with old API).
 * @deprecated Use SkillRegistry.getInstance() instead
 */
export function getDefaultSkillRegistry(): SkillRegistry {
  return SkillRegistry.getInstance();
}

/**
 * Reset the default skill registry (compatibility).
 * @deprecated Use resetSkillRegistry() instead
 */
export function resetDefaultSkillRegistry(): void {
  resetSkillRegistry();
}

// Re-export old CORE_SKILLS for compatibility
export { CORE_SKILLS } from './coreSkills';
```

### Step 4: Run test to verify it passes

Run: `npm test -- --run src/copilot/skills/__tests__/skillRegistry.unified.test.ts`
Expected: PASS

### Step 5: Run all existing skill tests to ensure compatibility

Run: `npm test -- --run src/copilot/__tests__/skillLoader.test.ts`
Expected: PASS (may need minor adjustments)

### Step 6: Commit

```bash
git add src/copilot/skills/skillRegistry.ts src/copilot/skills/__tests__/skillRegistry.unified.test.ts
git commit -m "feat(skills): rewrite SkillRegistry as unified IndexedDB-backed system"
```

---

## Task 7: Update skillLoader for Async Initialization

**Files:**
- Modify: `src/copilot/skills/skillLoader.ts`

### Step 1: Update skillLoader to work with async registry

```typescript
// Add initialization check at top of getRelevantSkills
export function getRelevantSkills(message: string): PatternSkill[] {
  const registry = getDefaultSkillRegistry();
  // ... rest unchanged, but use registry.getEnabled() for enabled skills only
}
```

### Step 2: Run tests

Run: `npm test -- --run src/copilot/__tests__/skillLoader.test.ts`

### Step 3: Commit

```bash
git add src/copilot/skills/skillLoader.ts
git commit -m "fix(skills): update skillLoader for unified registry"
```

---

## Task 8: App Integration

**Files:**
- Modify: `src/main.tsx` or `src/App.tsx`

### Step 1: Add registry initialization to app bootstrap

```typescript
// src/App.tsx
import { useEffect, useState } from 'react';
import { SkillRegistry } from './copilot/skills';

function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function init() {
      const registry = SkillRegistry.getInstance();
      await registry.initialize();
      setReady(true);
    }
    init();
  }, []);

  if (!ready) {
    return <div>Loading...</div>;
  }

  return (
    <Provider store={store}>
      <Workspace />
      <SolverMetrics />
    </Provider>
  );
}
```

### Step 2: Run full test suite

Run: `npm test -- --run`

### Step 3: Run build

Run: `npm run build`

### Step 4: Commit

```bash
git add src/App.tsx
git commit -m "feat(app): initialize SkillRegistry on startup"
```

---

## Task 9: Public Index Exports

**Files:**
- Create: `src/copilot/skills/index.ts`

### Step 1: Create public API exports

```typescript
// src/copilot/skills/index.ts
/**
 * Skills Module — public API
 *
 * @module skills
 */

// Core types
export type { NSID, ParsedNSID } from './nsid';
export type { SkillSource, RegisteredSkill, TriggerPreference } from './registryTypes';
export type { PatternSkill, Formula, DraftingMethod, ConstructionStep, SkillGradeRule } from './types';
export type { CommunitySkill, CommunitySkillMetadata } from './communityFormat';
export type { SkillEvent, SkillEventHandler } from './skillEvents';

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
```

### Step 2: Commit

```bash
git add src/copilot/skills/index.ts
git commit -m "feat(skills): add public index exports"
```

---

## Task 10: Final Integration Tests

**Files:**
- Create: `src/copilot/skills/__tests__/integration.test.ts`

### Step 1: Write integration tests

```typescript
// src/copilot/skills/__tests__/integration.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';

describe('SkillRegistry Integration', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('full lifecycle: register, find, disable, enable, unregister', async () => {
    const { SkillRegistry, resetSkillRegistry } = await import('../skillRegistry');
    const registry = SkillRegistry.getInstance();
    await registry.initialize();

    // Register
    const nsid = await registry.registerFromJSON(JSON.stringify({
      schemaVersion: '1.0.0',
      metadata: { id: 'integration:test', name: 'Test', version: '1.0.0', author: 'Test', description: 'Test', tags: [], license: 'MIT' },
      skill: { name: 'test', triggers: ['integration test'], description: 'Test', methods: [{ name: 'D', origin: 'US', description: 'D', formulas: {} }], formulas: {}, easeTable: {}, constructionSteps: [{ order: 1, instruction: 'S', toolCalls: [] }] },
    }));

    expect(registry.has(nsid)).toBe(true);

    // Find by trigger
    const found = registry.findByTrigger('integration test');
    expect(found?.nsid).toBe(nsid);

    // Disable
    await registry.disable(nsid);
    expect(registry.get(nsid)?.enabled).toBe(false);

    // Enable
    await registry.enable(nsid);
    expect(registry.get(nsid)?.enabled).toBe(true);

    // Unregister
    await registry.unregister(nsid);
    expect(registry.has(nsid)).toBe(false);

    await resetSkillRegistry();
  });

  it('persists skills across registry resets', async () => {
    // First session
    let mod = await import('../skillRegistry');
    let registry = mod.SkillRegistry.getInstance();
    await registry.initialize();

    await registry.registerFromJSON(JSON.stringify({
      schemaVersion: '1.0.0',
      metadata: { id: 'persist:test', name: 'Persist', version: '1.0.0', author: 'Test', description: 'Test', tags: [], license: 'MIT' },
      skill: { name: 'persist', triggers: ['persist'], description: 'Test', methods: [{ name: 'D', origin: 'US', description: 'D', formulas: {} }], formulas: {}, easeTable: {}, constructionSteps: [{ order: 1, instruction: 'S', toolCalls: [] }] },
    }));

    await mod.resetSkillRegistry();

    // Second session
    vi.resetModules();
    mod = await import('../skillRegistry');
    registry = mod.SkillRegistry.getInstance();
    await registry.initialize();

    expect(registry.has('persist:test')).toBe(true);

    await mod.resetSkillRegistry();
  });
});
```

### Step 2: Run all tests

Run: `npm test -- --run`
Expected: All tests pass

### Step 3: Commit

```bash
git add src/copilot/skills/__tests__/integration.test.ts
git commit -m "test(skills): add integration tests for SkillRegistry lifecycle"
```

---

## Task 11: Final Cleanup and PR

### Step 1: Run full test suite

Run: `npm test -- --run`

### Step 2: Run build

Run: `npm run build`

### Step 3: Update Issue #171 checklist

The success criteria should now be met:
- [x] Skills can be registered dynamically without app rebuild
- [x] Community skills persist across sessions via IndexedDB
- [x] NSID collisions are detected and reported
- [x] Core skills cannot be unregistered
- [x] All existing tests continue to pass
- [x] New tests cover all public APIs

### Step 4: Final commit

```bash
git add -A
git commit -m "feat(skills): complete unified SkillRegistry implementation

Implements Issue #171 — Dynamic .oskill injection with:
- NSID-based namespace identification
- IndexedDB persistence layer
- Event-driven architecture
- Migration from localStorage
- Full test coverage

Part of Epic #163 (Skill Marketplace)"
```

### Step 5: Push

```bash
git push
```

---

**Plan complete and saved to `docs/plans/2026-02-28-skill-registry-implementation.md`.**

**Two execution options:**

1. **Subagent-Driven (this session)** — I dispatch fresh subagent per task, review between tasks, fast iteration

2. **Parallel Session (separate)** — Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
