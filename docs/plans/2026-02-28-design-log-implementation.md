# Design Log Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement a durable design log that persists design decisions and formula overrides, with memory flush protocol for context compaction.

**Architecture:** Class-based manager in `src/copilot/vision/designLog.ts`. Uses existing storage abstraction for IndexedDB persistence. Serializes to Markdown for human readability. Integrates with CerebralContext.

**Tech Stack:** TypeScript, Vitest, existing storage utils, existing DesignLog types

---

## Task 1: Create Core DesignLogManager Class

**Files:**
- Create: `src/copilot/vision/designLog.ts`
- Create: `src/copilot/vision/__tests__/designLog.test.ts`

**Step 1: Write the failing test**

Create `src/copilot/vision/__tests__/designLog.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { DesignLogManager } from '../designLog';
import type { DesignLogEntry, SkillOverride } from '../types';

describe('DesignLogManager - Core Operations', () => {
  let manager: DesignLogManager;

  beforeEach(() => {
    manager = new DesignLogManager('test-project');
  });

  it('should initialize with empty log', () => {
    const log = manager.getLog();
    expect(log.projectId).toBe('test-project');
    expect(log.entries).toHaveLength(0);
    expect(log.overrides).toHaveLength(0);
  });

  it('should add design log entries', () => {
    const entry: DesignLogEntry = {
      id: 'entry-1',
      timestamp: Date.now(),
      type: 'decision',
      summary: 'Increased armhole depth by 2cm',
      relatedPieceIds: ['front', 'back'],
    };

    manager.addEntry(entry);

    const log = manager.getLog();
    expect(log.entries).toHaveLength(1);
    expect(log.entries[0].summary).toBe('Increased armhole depth by 2cm');
  });

  it('should add skill overrides', () => {
    const override: SkillOverride = {
      id: 'override-1',
      skillId: 'core:bodice',
      formulaName: 'armhole_depth',
      originalValue: 'bust_arc / 5 + 2',
      overrideValue: 'bust_arc / 5 + 4',
      reason: 'User prefers deeper armholes',
      createdAt: Date.now(),
    };

    manager.addOverride(override);

    const log = manager.getLog();
    expect(log.overrides).toHaveLength(1);
    expect(log.overrides[0].formulaName).toBe('armhole_depth');
  });

  it('should get recent entries', () => {
    for (let i = 0; i < 5; i++) {
      manager.addEntry({
        id: `entry-${i}`,
        timestamp: Date.now() + i,
        type: 'decision',
        summary: `Decision ${i}`,
        relatedPieceIds: [],
      });
    }

    const recent = manager.getRecentEntries(3);
    expect(recent).toHaveLength(3);
    expect(recent[0].summary).toBe('Decision 4'); // Most recent first
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/copilot/vision/__tests__/designLog.test.ts`
Expected: FAIL with "Cannot find module '../designLog'"

**Step 3: Write minimal implementation**

Create `src/copilot/vision/designLog.ts`:

```typescript
/**
 * Design Log Manager — Durable persistence for design decisions.
 *
 * Responsibilities:
 * - Manage DesignLogEntry[] and SkillOverride[] in memory
 * - Serialize to Markdown for human readability
 * - Flush to IndexedDB via storage abstraction
 * - Trigger flush when token threshold exceeded
 *
 * @module copilot/vision/designLog
 */

import type { DesignLog, DesignLogEntry, SkillOverride } from './types';

// ─── Constants ──────────────────────────────────────────────────────────────

/** Token threshold for triggering memory flush */
export const TOKEN_FLUSH_THRESHOLD = 4000;

/** Storage key prefix for design logs */
export const DESIGN_LOG_STORAGE_KEY = 'design-log';

// ─── DesignLogManager Class ─────────────────────────────────────────────────

/**
 * Manages the durable design log for a project.
 */
export class DesignLogManager {
  private projectId: string;
  private log: DesignLog;

  constructor(projectId: string) {
    this.projectId = projectId;
    this.log = {
      projectId,
      entries: [],
      overrides: [],
      lastFlushAt: Date.now(),
    };
  }

  /**
   * Get the current design log.
   */
  getLog(): DesignLog {
    return this.log;
  }

  /**
   * Add a design log entry.
   */
  addEntry(entry: DesignLogEntry): void {
    this.log.entries.push(entry);
  }

  /**
   * Add a skill override.
   */
  addOverride(override: SkillOverride): void {
    // Check if override for same skill/formula exists
    const existingIndex = this.log.overrides.findIndex(
      o => o.skillId === override.skillId && o.formulaName === override.formulaName
    );

    if (existingIndex >= 0) {
      // Replace existing override
      this.log.overrides[existingIndex] = override;
    } else {
      this.log.overrides.push(override);
    }
  }

  /**
   * Get the most recent entries, ordered newest first.
   */
  getRecentEntries(count: number): DesignLogEntry[] {
    return [...this.log.entries]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, count);
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/copilot/vision/__tests__/designLog.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/copilot/vision/designLog.ts src/copilot/vision/__tests__/designLog.test.ts
git commit -m "feat(vision): add DesignLogManager core class

- Initialize with project ID
- Add entries and overrides
- Get recent entries sorted by timestamp

Part of #183"
```

---

## Task 2: Add Markdown Serialization

**Files:**
- Modify: `src/copilot/vision/designLog.ts`
- Modify: `src/copilot/vision/__tests__/designLog.test.ts`

**Step 1: Write the failing test**

Append to test file:

```typescript
import { designLogToMarkdown } from '../designLog';

describe('DesignLogManager - Markdown Serialization', () => {
  it('should serialize empty log to markdown', () => {
    const manager = new DesignLogManager('test-project');
    const markdown = manager.toMarkdown();

    expect(markdown).toContain('# Design Log');
    expect(markdown).toContain('test-project');
  });

  it('should serialize entries to markdown', () => {
    const manager = new DesignLogManager('test-project');
    manager.addEntry({
      id: 'entry-1',
      timestamp: 1709136000000, // Fixed timestamp for testing
      type: 'decision',
      summary: 'Increased armhole depth by 2cm',
      relatedPieceIds: ['front', 'back'],
      metadata: { reasoning: 'Athletic fit requested' },
    });

    const markdown = manager.toMarkdown();

    expect(markdown).toContain('## Decisions');
    expect(markdown).toContain('Increased armhole depth by 2cm');
    expect(markdown).toContain('front');
    expect(markdown).toContain('back');
  });

  it('should serialize overrides to markdown', () => {
    const manager = new DesignLogManager('test-project');
    manager.addOverride({
      id: 'override-1',
      skillId: 'core:bodice',
      formulaName: 'armhole_depth',
      originalValue: 'bust_arc / 5 + 2',
      overrideValue: 'bust_arc / 5 + 4',
      reason: 'User prefers deeper armholes',
      createdAt: 1709136000000,
    });

    const markdown = manager.toMarkdown();

    expect(markdown).toContain('## Formula Overrides');
    expect(markdown).toContain('core:bodice');
    expect(markdown).toContain('armhole_depth');
    expect(markdown).toContain('bust_arc / 5 + 2');
    expect(markdown).toContain('bust_arc / 5 + 4');
  });

  it('should use standalone function for serialization', () => {
    const log: DesignLog = {
      projectId: 'standalone-test',
      entries: [],
      overrides: [],
      lastFlushAt: Date.now(),
    };

    const markdown = designLogToMarkdown(log);
    expect(markdown).toContain('standalone-test');
  });
});
```

**Step 2: Run test to verify it fails**

**Step 3: Write implementation**

Add to `designLog.ts`:

```typescript
// ─── Markdown Serialization ─────────────────────────────────────────────────

/**
 * Format a timestamp as ISO date string.
 */
function formatTimestamp(ts: number): string {
  return new Date(ts).toISOString().replace('T', ' ').slice(0, 19);
}

/**
 * Serialize a design log to Markdown format.
 */
export function designLogToMarkdown(log: DesignLog): string {
  const lines: string[] = [];

  lines.push(`# Design Log - ${log.projectId}`);
  lines.push('');
  lines.push(`> Last updated: ${formatTimestamp(log.lastFlushAt)}`);
  lines.push('');

  // Decisions section
  lines.push('## Decisions');
  lines.push('');

  if (log.entries.length === 0) {
    lines.push('_No decisions recorded yet._');
    lines.push('');
  } else {
    // Group by type
    const byType = new Map<string, DesignLogEntry[]>();
    for (const entry of log.entries) {
      const list = byType.get(entry.type) || [];
      list.push(entry);
      byType.set(entry.type, list);
    }

    for (const [type, entries] of byType) {
      for (const entry of entries) {
        lines.push(`### ${formatTimestamp(entry.timestamp)} - ${type}`);
        lines.push(`**${entry.summary}**`);
        if (entry.relatedPieceIds.length > 0) {
          lines.push(`- Pieces: ${entry.relatedPieceIds.join(', ')}`);
        }
        if (entry.metadata) {
          for (const [key, value] of Object.entries(entry.metadata)) {
            lines.push(`- ${key}: ${String(value)}`);
          }
        }
        lines.push('');
      }
    }
  }

  // Overrides section
  lines.push('## Formula Overrides');
  lines.push('');

  if (log.overrides.length === 0) {
    lines.push('_No formula overrides._');
    lines.push('');
  } else {
    for (const override of log.overrides) {
      lines.push(`### ${override.skillId} - ${override.formulaName}`);
      lines.push(`- Original: \`${override.originalValue}\``);
      lines.push(`- Override: \`${override.overrideValue}\``);
      lines.push(`- Reason: ${override.reason}`);
      lines.push(`- Created: ${formatTimestamp(override.createdAt)}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

// Add method to DesignLogManager class:
// In the class, add:
//   toMarkdown(): string {
//     return designLogToMarkdown(this.log);
//   }
```

Update the DesignLogManager class to add:

```typescript
  /**
   * Serialize the log to Markdown format.
   */
  toMarkdown(): string {
    return designLogToMarkdown(this.log);
  }
```

**Step 4: Run tests**

**Step 5: Commit**

```bash
git add src/copilot/vision/
git commit -m "feat(vision): add markdown serialization for design log

- designLogToMarkdown standalone function
- toMarkdown method on manager
- Human-readable format with sections

Part of #183"
```

---

## Task 3: Add Memory Flush Protocol

**Files:**
- Modify: `src/copilot/vision/designLog.ts`
- Modify: `src/copilot/vision/__tests__/designLog.test.ts`

**Step 1: Write the failing test**

Append to test file:

```typescript
describe('DesignLogManager - Memory Flush', () => {
  it('should determine when flush is needed', () => {
    const manager = new DesignLogManager('test-project');

    // Below threshold
    expect(manager.shouldFlush(3000)).toBe(false);

    // At threshold
    expect(manager.shouldFlush(4000)).toBe(true);

    // Above threshold
    expect(manager.shouldFlush(5000)).toBe(true);
  });

  it('should update lastFlushAt on flush', async () => {
    const manager = new DesignLogManager('test-project');
    const beforeFlush = manager.getLog().lastFlushAt;

    // Wait a tiny bit to ensure timestamp changes
    await new Promise(r => setTimeout(r, 10));
    await manager.flush();

    const afterFlush = manager.getLog().lastFlushAt;
    expect(afterFlush).toBeGreaterThan(beforeFlush);
  });

  it('should clear old entries on flush keeping recent ones', async () => {
    const manager = new DesignLogManager('test-project');

    // Add 20 entries
    for (let i = 0; i < 20; i++) {
      manager.addEntry({
        id: `entry-${i}`,
        timestamp: Date.now() - (20 - i) * 1000, // Oldest first
        type: 'decision',
        summary: `Decision ${i}`,
        relatedPieceIds: [],
      });
    }

    expect(manager.getLog().entries).toHaveLength(20);

    await manager.flush();

    // Should keep only recent entries (configurable, default 10)
    expect(manager.getLog().entries.length).toBeLessThanOrEqual(10);
  });
});
```

**Step 2: Run test to verify it fails**

**Step 3: Write implementation**

Add to `designLog.ts`:

```typescript
/** Maximum entries to keep after flush */
const MAX_ENTRIES_AFTER_FLUSH = 10;

// Add to DesignLogManager class:

  /**
   * Check if memory flush is needed based on token count.
   */
  shouldFlush(currentSessionTokens: number): boolean {
    return currentSessionTokens >= TOKEN_FLUSH_THRESHOLD;
  }

  /**
   * Flush the log: compact entries, update timestamp.
   * In a real implementation, this would persist to storage.
   */
  async flush(): Promise<void> {
    // Sort entries by timestamp (newest first) and keep only recent ones
    this.log.entries = [...this.log.entries]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, MAX_ENTRIES_AFTER_FLUSH);

    // Update flush timestamp
    this.log.lastFlushAt = Date.now();

    // Storage would happen here in full implementation
    // await storageSet('settings', `${this.projectId}:${DESIGN_LOG_STORAGE_KEY}`, this.log);
  }
```

**Step 4: Run tests**

**Step 5: Commit**

```bash
git add src/copilot/vision/
git commit -m "feat(vision): add memory flush protocol

- shouldFlush checks token threshold
- flush compacts entries and updates timestamp
- Keeps only recent entries after flush

Part of #183"
```

---

## Task 4: Add Decision Extraction from Messages

**Files:**
- Modify: `src/copilot/vision/designLog.ts`
- Modify: `src/copilot/vision/__tests__/designLog.test.ts`

**Step 1: Write the failing test**

Append to test file:

```typescript
import { extractDecisionsFromMessage } from '../designLog';

describe('DesignLogManager - Decision Extraction', () => {
  it('should extract decisions from tool call messages', () => {
    const message = 'Modified the front piece to increase armhole depth by 2cm for better mobility.';
    const tools = ['modifyDimension'];
    const pieceIds = ['front'];

    const entries = extractDecisionsFromMessage(message, tools, pieceIds);

    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0].type).toBe('decision');
    expect(entries[0].summary).toContain('armhole');
    expect(entries[0].relatedPieceIds).toContain('front');
  });

  it('should extract constraints from constraint-related messages', () => {
    const message = 'Seam allowance must be at least 10mm for industrial sewing.';
    const tools: string[] = [];
    const pieceIds: string[] = [];

    const entries = extractDecisionsFromMessage(message, tools, pieceIds);

    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0].type).toBe('constraint');
  });

  it('should extract warnings from warning-related messages', () => {
    const message = 'Warning: The current neckline curve may cause fitting issues.';
    const tools: string[] = [];
    const pieceIds: string[] = [];

    const entries = extractDecisionsFromMessage(message, tools, pieceIds);

    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0].type).toBe('warning');
  });

  it('should return empty array for generic messages', () => {
    const message = 'Hello, how can I help you today?';
    const tools: string[] = [];
    const pieceIds: string[] = [];

    const entries = extractDecisionsFromMessage(message, tools, pieceIds);

    expect(entries).toHaveLength(0);
  });
});
```

**Step 2: Run test to verify it fails**

**Step 3: Write implementation**

Add to `designLog.ts`:

```typescript
// ─── Decision Extraction ────────────────────────────────────────────────────

/** Keywords indicating a decision was made */
const DECISION_KEYWORDS = [
  'modified', 'changed', 'adjusted', 'increased', 'decreased',
  'added', 'removed', 'set', 'updated', 'created', 'applied',
];

/** Keywords indicating a constraint */
const CONSTRAINT_KEYWORDS = [
  'must', 'should', 'require', 'constraint', 'rule', 'standard',
  'always', 'never', 'minimum', 'maximum', 'at least', 'at most',
];

/** Keywords indicating a warning */
const WARNING_KEYWORDS = [
  'warning', 'caution', 'issue', 'problem', 'risk', 'may cause',
  'could cause', 'potential', 'careful', 'attention',
];

/**
 * Generate a unique ID for a log entry.
 */
function generateEntryId(): string {
  return `entry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Extract design decisions from a message.
 */
export function extractDecisionsFromMessage(
  message: string,
  tools: string[],
  pieceIds: string[],
): DesignLogEntry[] {
  const entries: DesignLogEntry[] = [];
  const lowerMessage = message.toLowerCase();

  // Check for warnings first (highest priority)
  const hasWarning = WARNING_KEYWORDS.some(kw => lowerMessage.includes(kw));
  if (hasWarning) {
    entries.push({
      id: generateEntryId(),
      timestamp: Date.now(),
      type: 'warning',
      summary: extractSummary(message),
      relatedPieceIds: pieceIds,
      metadata: tools.length > 0 ? { tools } : undefined,
    });
    return entries;
  }

  // Check for constraints
  const hasConstraint = CONSTRAINT_KEYWORDS.some(kw => lowerMessage.includes(kw));
  if (hasConstraint) {
    entries.push({
      id: generateEntryId(),
      timestamp: Date.now(),
      type: 'constraint',
      summary: extractSummary(message),
      relatedPieceIds: pieceIds,
      metadata: tools.length > 0 ? { tools } : undefined,
    });
    return entries;
  }

  // Check for decisions (tool use or decision keywords)
  const hasDecision = tools.length > 0 || DECISION_KEYWORDS.some(kw => lowerMessage.includes(kw));
  if (hasDecision) {
    entries.push({
      id: generateEntryId(),
      timestamp: Date.now(),
      type: 'decision',
      summary: extractSummary(message),
      relatedPieceIds: pieceIds,
      metadata: tools.length > 0 ? { tools } : undefined,
    });
    return entries;
  }

  return entries;
}

/**
 * Extract a summary from a message (first sentence or truncated).
 */
function extractSummary(message: string): string {
  // Get first sentence
  const firstSentence = message.split(/[.!?]/)[0].trim();

  // Truncate if too long
  if (firstSentence.length > 100) {
    return firstSentence.slice(0, 97) + '...';
  }

  return firstSentence;
}
```

**Step 4: Run tests**

**Step 5: Commit**

```bash
git add src/copilot/vision/
git commit -m "feat(vision): add decision extraction from messages

- extractDecisionsFromMessage analyzes message content
- Detects decisions, constraints, and warnings
- Extracts summary from first sentence

Part of #183"
```

---

## Task 5: Add Index Exports and Final Integration

**Files:**
- Modify: `src/copilot/vision/designLog.ts`
- Modify: `src/copilot/vision/__tests__/designLog.test.ts`
- Modify: `src/copilot/vision/index.ts`

**Step 1: Write integration test**

Append to test file:

```typescript
describe('DesignLogManager - Integration', () => {
  it('should support full workflow: add, extract, serialize, flush', async () => {
    const manager = new DesignLogManager('integration-test');

    // Extract and add decisions from message
    const entries = extractDecisionsFromMessage(
      'Adjusted the shoulder seam to 15mm for better fit.',
      ['modifyDimension'],
      ['front', 'back']
    );
    for (const entry of entries) {
      manager.addEntry(entry);
    }

    // Add an override
    manager.addOverride({
      id: 'override-1',
      skillId: 'core:bodice',
      formulaName: 'shoulder_width',
      originalValue: 'chest / 4',
      overrideValue: 'chest / 4 + 1',
      reason: 'Broader shoulders preferred',
      createdAt: Date.now(),
    });

    // Serialize to markdown
    const markdown = manager.toMarkdown();
    expect(markdown).toContain('shoulder seam');
    expect(markdown).toContain('shoulder_width');

    // Check flush threshold
    expect(manager.shouldFlush(5000)).toBe(true);

    // Flush
    await manager.flush();
    expect(manager.getLog().entries.length).toBeLessThanOrEqual(10);
  });
});
```

**Step 2: Update index.ts exports**

Add to `src/copilot/vision/index.ts`:

```typescript
// Design Log
export {
  DesignLogManager,
  designLogToMarkdown,
  extractDecisionsFromMessage,
  TOKEN_FLUSH_THRESHOLD,
  DESIGN_LOG_STORAGE_KEY,
} from './designLog';
```

**Step 3: Run all tests**

**Step 4: Commit**

```bash
git add src/copilot/vision/
git commit -m "feat(vision): complete design log with exports

- Export DesignLogManager and utilities from index
- Integration test for full workflow

Closes #183"
```

---

## Task 6: Run All Tests and Close Issue

**Step 1: Run full test suite**

```bash
npm test -- --run
```

Expected: All tests pass

**Step 2: Push changes**

```bash
git push origin main
```

**Step 3: Close issue**

```bash
gh issue close 183 --comment "Implemented Durable Design Log:
- DesignLogManager class for managing entries and overrides
- Markdown serialization (designLogToMarkdown)
- Memory flush protocol (shouldFlush, flush)
- Decision extraction from messages (extractDecisionsFromMessage)
- Token threshold constant (4000 tokens)

All functions exported from src/copilot/vision/index.ts"
```

---

## Summary

| Task | Component | Tests |
|------|-----------|-------|
| 1 | Core DesignLogManager | 4 |
| 2 | Markdown serialization | 4 |
| 3 | Memory flush protocol | 3 |
| 4 | Decision extraction | 4 |
| 5 | Integration + exports | 1 |
| 6 | Final verification | - |

**Total new tests:** 16
**Files created:** 1 (`designLog.ts`)
**Files modified:** 2 (`index.ts`, `designLog.test.ts`)
