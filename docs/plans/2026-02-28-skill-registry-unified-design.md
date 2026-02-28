# Design: Unified SkillRegistry with IndexedDB Persistence

**Issue:** #171 — Refactor SkillRegistry for dynamic .oskill injection
**Epic:** #163 — OpenClo Skill Marketplace & Copilot Extensibility
**Date:** 2026-02-28
**Status:** Approved

## 1. Overview

Transform the SkillRegistry from a static TypeScript-based registry into a unified, persistence-backed system that supports dynamic loading of community skills at runtime.

### Goals
- Single source of truth for all skills (core + community)
- NSID-based identification for namespace collision prevention
- IndexedDB persistence for professional-grade storage
- Event-driven architecture for UI reactivity
- Auto-load installed skills on app startup

### Non-Goals
- Remote skill hosting (handled by marketplace.ts)
- Skill authoring tools (separate epic)
- Seamly2D bridge (Issue #173)

## 2. Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        SkillRegistry                             │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────────┐  │
│  │  CoreSkills    │  │ CommunitySkills│  │   TriggerIndex     │  │
│  │  (immutable)   │  │  (IndexedDB)   │  │   (in-memory)      │  │
│  └────────────────┘  └────────────────┘  └────────────────────┘  │
│                              │                                    │
│                     ┌────────▼────────┐                          │
│                     │ SkillPersistence │                          │
│                     │   (IndexedDB)    │                          │
│                     └──────────────────┘                          │
└──────────────────────────────────────────────────────────────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
       SkillValidator    SkillEvents      NSIDParser
```

## 3. Type System

### 3.1 NSID (Namespace Identifier)

```typescript
/** Format: "author:slug" e.g. "openclo:bodice", "sdar:stretch_bodice" */
type NSID = `${string}:${string}`;

interface ParsedNSID {
  author: string;
  slug: string;
  full: NSID;
}
```

### 3.2 Skill Source

```typescript
type SkillSource = 'core' | 'community' | 'local';
```

### 3.3 Registered Skill

```typescript
interface RegisteredSkill {
  nsid: NSID;
  source: SkillSource;
  version: string;
  checksum: string;           // SHA-256 for integrity
  installedAt: number;
  updatedAt: number;
  enabled: boolean;           // Can disable without uninstalling
  skill: PatternSkill;
  metadata?: CommunitySkillMetadata;
}
```

### 3.4 Trigger Preference

```typescript
interface TriggerPreference {
  trigger: string;
  preferredNsid: NSID;
}
```

## 4. IndexedDB Schema

```typescript
// Database: 'openclo_skills_v1'
const DB_SCHEMA = {
  skills: {
    keyPath: 'nsid',
    indexes: [
      { name: 'source', keyPath: 'source' },
      { name: 'enabled', keyPath: 'enabled' },
      { name: 'installedAt', keyPath: 'installedAt' },
    ],
  },
  preferences: {
    keyPath: 'trigger',
  },
};
```

## 5. SkillRegistry API

```typescript
class SkillRegistry {
  // ─── Lifecycle ─────────────────────────────────────────────────
  private constructor();
  static getInstance(): SkillRegistry;
  async initialize(): Promise<void>;

  // ─── Registration ──────────────────────────────────────────────
  async register(skill: CommunitySkill, source?: SkillSource): Promise<NSID>;
  async registerFromJSON(json: string): Promise<NSID>;
  async unregister(nsid: NSID): Promise<boolean>;
  async enable(nsid: NSID): Promise<void>;
  async disable(nsid: NSID): Promise<void>;

  // ─── Queries (sync, in-memory) ─────────────────────────────────
  get(nsid: NSID): RegisteredSkill | undefined;
  getAll(): RegisteredSkill[];
  getBySource(source: SkillSource): RegisteredSkill[];
  getEnabled(): RegisteredSkill[];
  has(nsid: NSID): boolean;

  // ─── Trigger Matching ──────────────────────────────────────────
  findByTrigger(phrase: string): RegisteredSkill | undefined;
  findAllByTrigger(phrase: string): RegisteredSkill[];

  // ─── Conflict Resolution ───────────────────────────────────────
  getConflicts(): Map<string, NSID[]>;
  async setPreference(trigger: string, nsid: NSID): Promise<void>;
  getPreference(trigger: string): NSID | undefined;

  // ─── Events ────────────────────────────────────────────────────
  on(event: SkillEvent, handler: SkillEventHandler): () => void;

  // ─── Metadata ──────────────────────────────────────────────────
  get size(): number;
  get coreCount(): number;
  get communityCount(): number;
}

type SkillEvent = 'skill:registered' | 'skill:unregistered' |
                  'skill:enabled' | 'skill:disabled' | 'skill:updated';

type SkillEventHandler = (nsid: NSID, skill?: RegisteredSkill) => void;
```

## 6. SkillPersistence API

```typescript
class SkillPersistence {
  private db: IDBDatabase;

  async open(): Promise<void>;
  async close(): Promise<void>;

  // Skills CRUD
  async saveSkill(skill: RegisteredSkill): Promise<void>;
  async getSkill(nsid: NSID): Promise<RegisteredSkill | undefined>;
  async getAllSkills(): Promise<RegisteredSkill[]>;
  async deleteSkill(nsid: NSID): Promise<boolean>;

  // Preferences
  async setPreference(trigger: string, nsid: NSID): Promise<void>;
  async getPreference(trigger: string): Promise<NSID | undefined>;
  async getAllPreferences(): Promise<TriggerPreference[]>;

  // Migration
  async migrateFromLocalStorage(): Promise<number>;
}
```

## 7. SkillValidator API

```typescript
interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

class SkillValidator {
  validateNSID(nsid: string): ValidationResult;
  validatePatternSkill(skill: PatternSkill): ValidationResult;
  validateCommunitySkill(cs: CommunitySkill): ValidationResult;
  computeChecksum(skill: PatternSkill): string;
}
```

## 8. File Structure

```
src/copilot/skills/
├── index.ts                    # Public exports
├── types.ts                    # PatternSkill types (unchanged)
├── nsid.ts                     # NSID type, parser, validator
├── skillRegistry.ts            # Unified registry
├── skillPersistence.ts         # IndexedDB layer
├── skillValidator.ts           # JSON Schema + checksum
├── skillEvents.ts              # Event emitter
├── coreSkills.ts               # Exports CORE_SKILLS with NSIDs
├── definitions/                # Core skill definitions (unchanged)
│   ├── bodiceSkill.ts
│   ├── sleeveSkill.ts
│   ├── skirtSkill.ts
│   ├── collarSkill.ts
│   └── gradingSkill.ts
├── marketplace.ts              # Remote fetch (simplified)
├── communityFormat.ts          # CommunitySkill types (unchanged)
└── __tests__/
    ├── skillRegistry.test.ts
    ├── skillPersistence.test.ts
    ├── skillValidator.test.ts
    └── nsid.test.ts
```

## 9. App Integration

```typescript
// src/main.tsx or App.tsx
import { SkillRegistry } from './copilot/skills';

async function bootstrap() {
  const registry = SkillRegistry.getInstance();
  await registry.initialize();
  // App ready
}
```

## 10. Error Handling

| Error | Handling |
|-------|----------|
| Invalid NSID format | Throw `InvalidNSIDError` with format hint |
| Validation failure | Throw `SkillValidationError` with error list |
| Duplicate NSID | Throw `DuplicateSkillError` |
| Unregister core skill | Throw `CoreSkillProtectedError` |
| IndexedDB unavailable | Fallback to in-memory only, warn user |

## 11. Migration Strategy

1. First run detects localStorage skills via `loadInstalledCommunitySkills()`
2. Migrates to IndexedDB with `migrateFromLocalStorage()`
3. Clears old localStorage keys
4. Core skills get `openclo:` prefix automatically

## 12. Success Criteria

- [ ] Skills can be registered dynamically without app rebuild
- [ ] Community skills persist across sessions via IndexedDB
- [ ] NSID collisions are detected and reported
- [ ] Core skills cannot be unregistered
- [ ] All existing tests continue to pass
- [ ] New tests cover all public APIs
