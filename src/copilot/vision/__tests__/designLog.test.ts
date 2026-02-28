import { describe, it, expect } from 'vitest';
import {
  DesignLogManager,
  TOKEN_FLUSH_THRESHOLD,
  DESIGN_LOG_STORAGE_KEY,
  formatTimestamp,
  designLogToMarkdown,
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
