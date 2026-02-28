import { describe, it, expect } from 'vitest';
import {
  DesignLogManager,
  TOKEN_FLUSH_THRESHOLD,
  DESIGN_LOG_STORAGE_KEY,
  formatTimestamp,
  designLogToMarkdown,
  DECISION_KEYWORDS,
  CONSTRAINT_KEYWORDS,
  WARNING_KEYWORDS,
  generateEntryId,
  extractSummary,
  extractDecisionsFromMessage,
} from '../designLog';
import type { DesignLog, DesignLogEntry, SkillOverride } from '../types';

describe('DesignLogManager', () => {
  it('should initialize with empty log', () => {
    const manager = new DesignLogManager('project-123');
    const log = manager.getLog();

    expect(log.projectId).toBe('project-123');
    expect(log.entries).toEqual([]);
    expect(log.overrides).toEqual([]);
    expect(log.lastFlushAt).toBe(0);
  });

  it('should add design log entries', () => {
    const manager = new DesignLogManager('project-123');

    const entry: DesignLogEntry = {
      id: 'entry-1',
      timestamp: Date.now(),
      type: 'decision',
      summary: 'Increased ease at armhole by 5mm',
      relatedPieceIds: ['piece-front', 'piece-sleeve'],
    };

    manager.addEntry(entry);
    const log = manager.getLog();

    expect(log.entries).toHaveLength(1);
    expect(log.entries[0]).toEqual(entry);
  });

  it('should add skill overrides (replace if same skill/formula exists)', () => {
    const manager = new DesignLogManager('project-123');

    const override1: SkillOverride = {
      id: 'override-1',
      skillId: 'core:bodice',
      formulaName: 'ease_armhole',
      originalValue: '2mm',
      overrideValue: '5mm',
      reason: 'User prefers more ease',
      createdAt: 1000,
    };

    const override2: SkillOverride = {
      id: 'override-2',
      skillId: 'core:sleeve',
      formulaName: 'cap_height',
      originalValue: '10mm',
      overrideValue: '15mm',
      reason: 'Higher cap for style',
      createdAt: 2000,
    };

    // Same skill/formula as override1, should replace it
    const override3: SkillOverride = {
      id: 'override-3',
      skillId: 'core:bodice',
      formulaName: 'ease_armhole',
      originalValue: '2mm',
      overrideValue: '7mm',
      reason: 'Updated preference',
      createdAt: 3000,
    };

    manager.addOverride(override1);
    manager.addOverride(override2);
    manager.addOverride(override3);

    const log = manager.getLog();

    expect(log.overrides).toHaveLength(2);
    // override1 should be replaced by override3
    const armholeOverride = log.overrides.find(
      o => o.skillId === 'core:bodice' && o.formulaName === 'ease_armhole'
    );
    expect(armholeOverride?.id).toBe('override-3');
    expect(armholeOverride?.overrideValue).toBe('7mm');
    // override2 should still exist
    const sleeveOverride = log.overrides.find(o => o.skillId === 'core:sleeve');
    expect(sleeveOverride?.id).toBe('override-2');
  });

  it('should get recent entries sorted newest first', () => {
    const manager = new DesignLogManager('project-123');

    const entry1: DesignLogEntry = {
      id: 'entry-1',
      timestamp: 1000,
      type: 'decision',
      summary: 'First decision',
      relatedPieceIds: [],
    };

    const entry2: DesignLogEntry = {
      id: 'entry-2',
      timestamp: 3000,
      type: 'constraint',
      summary: 'Third entry (by timestamp)',
      relatedPieceIds: [],
    };

    const entry3: DesignLogEntry = {
      id: 'entry-3',
      timestamp: 2000,
      type: 'note',
      summary: 'Second entry (by timestamp)',
      relatedPieceIds: [],
    };

    manager.addEntry(entry1);
    manager.addEntry(entry2);
    manager.addEntry(entry3);

    // Get 2 most recent
    const recent = manager.getRecentEntries(2);

    expect(recent).toHaveLength(2);
    expect(recent[0].id).toBe('entry-2'); // timestamp 3000 (newest)
    expect(recent[1].id).toBe('entry-3'); // timestamp 2000

    // Get all
    const all = manager.getRecentEntries(10);
    expect(all).toHaveLength(3);
    expect(all[0].id).toBe('entry-2');
    expect(all[1].id).toBe('entry-3');
    expect(all[2].id).toBe('entry-1');
  });

  it('should export constants', () => {
    expect(TOKEN_FLUSH_THRESHOLD).toBe(4000);
    expect(DESIGN_LOG_STORAGE_KEY).toBeDefined();
    expect(typeof DESIGN_LOG_STORAGE_KEY).toBe('string');
  });

  describe('Memory Flush Protocol', () => {
    it('shouldFlush returns false below threshold (3000 tokens)', () => {
      const manager = new DesignLogManager('project-123');
      expect(manager.shouldFlush(3000)).toBe(false);
      expect(manager.shouldFlush(0)).toBe(false);
      expect(manager.shouldFlush(3999)).toBe(false);
    });

    it('shouldFlush returns true at/above threshold (4000+ tokens)', () => {
      const manager = new DesignLogManager('project-123');
      expect(manager.shouldFlush(4000)).toBe(true);
      expect(manager.shouldFlush(5000)).toBe(true);
      expect(manager.shouldFlush(10000)).toBe(true);
    });

    it('flush updates lastFlushAt timestamp', async () => {
      const manager = new DesignLogManager('project-123');
      const log = manager.getLog();
      expect(log.lastFlushAt).toBe(0);

      const beforeFlush = Date.now();
      await manager.flush();
      const afterFlush = Date.now();

      const updatedLog = manager.getLog();
      expect(updatedLog.lastFlushAt).toBeGreaterThanOrEqual(beforeFlush);
      expect(updatedLog.lastFlushAt).toBeLessThanOrEqual(afterFlush);
    });

    it('flush compacts entries keeping only recent (default 10)', async () => {
      const manager = new DesignLogManager('project-123');

      // Add 15 entries with increasing timestamps
      for (let i = 0; i < 15; i++) {
        manager.addEntry({
          id: `entry-${i}`,
          timestamp: 1000 + i * 100, // 1000, 1100, 1200, ..., 2400
          type: 'decision',
          summary: `Decision ${i}`,
          relatedPieceIds: [],
        });
      }

      expect(manager.getLog().entries).toHaveLength(15);

      await manager.flush();

      const log = manager.getLog();
      expect(log.entries).toHaveLength(10);

      // Should keep the 10 most recent entries (highest timestamps)
      // These are entries 5-14 (timestamps 1500-2400)
      expect(log.entries[0].id).toBe('entry-14'); // Most recent first
      expect(log.entries[9].id).toBe('entry-5'); // Least recent of kept entries
    });

    it('flush preserves entries if fewer than MAX_ENTRIES_AFTER_FLUSH', async () => {
      const manager = new DesignLogManager('project-123');

      // Add only 5 entries
      for (let i = 0; i < 5; i++) {
        manager.addEntry({
          id: `entry-${i}`,
          timestamp: 1000 + i * 100,
          type: 'decision',
          summary: `Decision ${i}`,
          relatedPieceIds: [],
        });
      }

      expect(manager.getLog().entries).toHaveLength(5);

      await manager.flush();

      const log = manager.getLog();
      expect(log.entries).toHaveLength(5);
      // Should be sorted by timestamp desc
      expect(log.entries[0].id).toBe('entry-4');
      expect(log.entries[4].id).toBe('entry-0');
    });
  });

  describe('toMarkdown', () => {
    it('should serialize empty log to markdown with header and project ID', () => {
      const manager = new DesignLogManager('my-project-456');
      const markdown = manager.toMarkdown();

      expect(markdown).toContain('# Design Log - my-project-456');
      expect(markdown).toContain('> Last updated:');
    });

    it('should serialize entries to markdown in Decisions section', () => {
      const manager = new DesignLogManager('project-123');

      const entry: DesignLogEntry = {
        id: 'entry-1',
        timestamp: 1700000000000, // Fixed timestamp for deterministic test
        type: 'decision',
        summary: 'Increased ease at armhole by 5mm',
        relatedPieceIds: ['piece-front', 'piece-sleeve'],
      };

      manager.addEntry(entry);
      const markdown = manager.toMarkdown();

      expect(markdown).toContain('## Decisions');
      expect(markdown).toContain('### 2023-11-14'); // Date from timestamp
      expect(markdown).toContain('- decision');
      expect(markdown).toContain('**Increased ease at armhole by 5mm**');
      expect(markdown).toContain('- Pieces: piece-front, piece-sleeve');
    });

    it('should serialize overrides to markdown in Formula Overrides section', () => {
      const manager = new DesignLogManager('project-123');

      const override: SkillOverride = {
        id: 'override-1',
        skillId: 'core:bodice',
        formulaName: 'ease_armhole',
        originalValue: '2mm',
        overrideValue: '5mm',
        reason: 'User prefers more ease',
        createdAt: 1000,
      };

      manager.addOverride(override);
      const markdown = manager.toMarkdown();

      expect(markdown).toContain('## Formula Overrides');
      expect(markdown).toContain('### core:bodice - ease_armhole');
      expect(markdown).toContain('- Original: `2mm`');
      expect(markdown).toContain('- Override: `5mm`');
      expect(markdown).toContain('- Reason: User prefers more ease');
    });
  });
});

describe('formatTimestamp', () => {
  it('should format timestamp to ISO date string', () => {
    // 2023-11-14T22:13:20.000Z
    const ts = 1700000000000;
    const formatted = formatTimestamp(ts);
    expect(formatted).toBe('2023-11-14 22:13:20');
  });
});

describe('designLogToMarkdown', () => {
  it('should serialize a complete log to markdown', () => {
    const log: DesignLog = {
      projectId: 'standalone-test',
      entries: [
        {
          id: 'e1',
          timestamp: 1700000000000,
          type: 'constraint',
          summary: 'Shoulder width must not exceed 40cm',
          relatedPieceIds: ['front', 'back'],
        },
      ],
      overrides: [
        {
          id: 'o1',
          skillId: 'core:sleeve',
          formulaName: 'cap_height',
          originalValue: '10mm',
          overrideValue: '15mm',
          reason: 'Higher cap for style',
          createdAt: 2000,
        },
      ],
      lastFlushAt: 0,
    };

    const markdown = designLogToMarkdown(log);

    // Header
    expect(markdown).toContain('# Design Log - standalone-test');
    expect(markdown).toContain('> Last updated:');

    // Decisions section
    expect(markdown).toContain('## Decisions');
    expect(markdown).toContain('- constraint');
    expect(markdown).toContain('**Shoulder width must not exceed 40cm**');
    expect(markdown).toContain('- Pieces: front, back');

    // Formula Overrides section
    expect(markdown).toContain('## Formula Overrides');
    expect(markdown).toContain('### core:sleeve - cap_height');
    expect(markdown).toContain('- Original: `10mm`');
    expect(markdown).toContain('- Override: `15mm`');
    expect(markdown).toContain('- Reason: Higher cap for style');
  });

  it('should handle log with no entries or overrides', () => {
    const log: DesignLog = {
      projectId: 'empty-project',
      entries: [],
      overrides: [],
      lastFlushAt: 0,
    };

    const markdown = designLogToMarkdown(log);

    expect(markdown).toContain('# Design Log - empty-project');
    // Should still have section headers but no content
    expect(markdown).toContain('## Decisions');
    expect(markdown).toContain('## Formula Overrides');
  });
});

describe('Decision Extraction', () => {
  describe('Keywords', () => {
    it('exports DECISION_KEYWORDS array', () => {
      expect(DECISION_KEYWORDS).toEqual([
        'modified',
        'changed',
        'adjusted',
        'increased',
        'decreased',
        'added',
        'removed',
        'set',
        'updated',
        'created',
        'applied',
      ]);
    });

    it('exports CONSTRAINT_KEYWORDS array', () => {
      expect(CONSTRAINT_KEYWORDS).toEqual([
        'must',
        'should',
        'require',
        'constraint',
        'rule',
        'standard',
        'always',
        'never',
        'minimum',
        'maximum',
      ]);
    });

    it('exports WARNING_KEYWORDS array', () => {
      expect(WARNING_KEYWORDS).toEqual([
        'warning',
        'caution',
        'issue',
        'problem',
        'risk',
        'may cause',
        'potential',
      ]);
    });
  });

  describe('generateEntryId', () => {
    it('generates unique IDs', () => {
      const id1 = generateEntryId();
      const id2 = generateEntryId();
      const id3 = generateEntryId();

      expect(id1).not.toBe(id2);
      expect(id2).not.toBe(id3);
      expect(id1).not.toBe(id3);
    });

    it('returns string IDs', () => {
      const id = generateEntryId();
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });
  });

  describe('extractSummary', () => {
    it('extracts first sentence from message', () => {
      const message = 'Increased the armhole ease by 5mm. This provides more comfort.';
      const summary = extractSummary(message);
      expect(summary).toBe('Increased the armhole ease by 5mm.');
    });

    it('truncates to max 100 characters', () => {
      const longMessage =
        'This is an extremely long sentence that goes on and on and continues for quite a while without stopping because someone decided to write without punctuation and it just keeps going forever.';
      const summary = extractSummary(longMessage);
      expect(summary.length).toBeLessThanOrEqual(100);
      expect(summary.endsWith('...')).toBe(true);
    });

    it('handles message with no period', () => {
      const message = 'No period in this message';
      const summary = extractSummary(message);
      expect(summary).toBe('No period in this message');
    });

    it('handles empty message', () => {
      const summary = extractSummary('');
      expect(summary).toBe('');
    });
  });

  describe('extractDecisionsFromMessage', () => {
    it('extracts decisions from tool call messages with decision keywords', () => {
      const message = 'I modified the sleeve length to 60cm for the front piece.';
      const tools = ['adjustSeamAllowance'];
      const pieceIds = ['piece-front'];

      const entries = extractDecisionsFromMessage(message, tools, pieceIds);

      expect(entries).toHaveLength(1);
      expect(entries[0].type).toBe('decision');
      expect(entries[0].summary).toContain('modified');
      expect(entries[0].relatedPieceIds).toEqual(['piece-front']);
    });

    it('extracts decisions when tools are present (even without keywords)', () => {
      const message = 'The operation completed successfully on the bodice.';
      const tools = ['movePiece', 'rotatePiece'];
      const pieceIds = ['piece-bodice'];

      const entries = extractDecisionsFromMessage(message, tools, pieceIds);

      expect(entries).toHaveLength(1);
      expect(entries[0].type).toBe('decision');
    });

    it('extracts constraints from constraint-related messages', () => {
      const message =
        'The shoulder width must not exceed 40cm. This is a requirement for the design.';
      const tools: string[] = [];
      const pieceIds = ['piece-front', 'piece-back'];

      const entries = extractDecisionsFromMessage(message, tools, pieceIds);

      expect(entries).toHaveLength(1);
      expect(entries[0].type).toBe('constraint');
      expect(entries[0].relatedPieceIds).toEqual(['piece-front', 'piece-back']);
    });

    it('extracts warnings from warning-related messages', () => {
      const message =
        'Warning: the current seam allowance may cause issues during assembly.';
      const tools: string[] = [];
      const pieceIds = ['piece-sleeve'];

      const entries = extractDecisionsFromMessage(message, tools, pieceIds);

      expect(entries).toHaveLength(1);
      expect(entries[0].type).toBe('warning');
      expect(entries[0].relatedPieceIds).toEqual(['piece-sleeve']);
    });

    it('prioritizes warnings over constraints and decisions', () => {
      const message =
        'Warning: you must be careful. I have adjusted the value but there is a risk.';
      const tools = ['adjustValue'];
      const pieceIds = ['piece-1'];

      const entries = extractDecisionsFromMessage(message, tools, pieceIds);

      expect(entries).toHaveLength(1);
      expect(entries[0].type).toBe('warning');
    });

    it('prioritizes constraints over decisions', () => {
      const message =
        'I have modified the piece. The minimum value should always be respected.';
      const tools: string[] = [];
      const pieceIds = ['piece-1'];

      const entries = extractDecisionsFromMessage(message, tools, pieceIds);

      expect(entries).toHaveLength(1);
      expect(entries[0].type).toBe('constraint');
    });

    it('returns empty array for generic messages with no keywords', () => {
      const message = 'Hello, how can I help you today?';
      const tools: string[] = [];
      const pieceIds: string[] = [];

      const entries = extractDecisionsFromMessage(message, tools, pieceIds);

      expect(entries).toEqual([]);
    });

    it('returns empty array for empty message', () => {
      const entries = extractDecisionsFromMessage('', [], []);
      expect(entries).toEqual([]);
    });

    it('handles case-insensitive keyword matching', () => {
      const message = 'WARNING: Please check the measurements.';
      const entries = extractDecisionsFromMessage(message, [], ['piece-1']);

      expect(entries).toHaveLength(1);
      expect(entries[0].type).toBe('warning');
    });

    it('generates valid entry IDs and timestamps', () => {
      const message = 'I adjusted the hemline by 2cm.';
      const beforeTime = Date.now();
      const entries = extractDecisionsFromMessage(message, [], ['piece-skirt']);
      const afterTime = Date.now();

      expect(entries).toHaveLength(1);
      expect(entries[0].id).toBeTruthy();
      expect(typeof entries[0].id).toBe('string');
      expect(entries[0].timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(entries[0].timestamp).toBeLessThanOrEqual(afterTime);
    });
  });
});
