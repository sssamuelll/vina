/**
 * Design Log Manager — Persistent memory for design decisions and user preferences.
 *
 * The design log captures:
 * - Design decisions made during the session
 * - Constraints that must be preserved
 * - User-defined formula overrides
 *
 * @module copilot/vision/designLog
 */

import type { DesignLog, DesignLogEntry, SkillOverride } from './types';

/** Token threshold for flushing log to storage */
export const TOKEN_FLUSH_THRESHOLD = 4000;

/**
 * Format a timestamp as a human-readable date string.
 * @param ts - Unix timestamp in milliseconds
 * @returns Formatted date string (YYYY-MM-DD HH:MM:SS)
 */
export function formatTimestamp(ts: number): string {
  const date = new Date(ts);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * Serialize a DesignLog to markdown format.
 *
 * Format:
 * ```markdown
 * # Design Log - {projectId}
 *
 * > Last updated: {timestamp}
 *
 * ## Decisions
 *
 * ### {timestamp} - {type}
 * **{summary}**
 * - Pieces: {pieceIds}
 *
 * ## Formula Overrides
 *
 * ### {skillId} - {formulaName}
 * - Original: `{originalValue}`
 * - Override: `{overrideValue}`
 * - Reason: {reason}
 * ```
 *
 * @param log - The design log to serialize
 * @returns Markdown string representation
 */
export function designLogToMarkdown(log: DesignLog): string {
  const lines: string[] = [];

  // Header
  lines.push(`# Design Log - ${log.projectId}`);
  lines.push('');
  lines.push(`> Last updated: ${formatTimestamp(Date.now())}`);
  lines.push('');

  // Decisions section
  lines.push('## Decisions');
  lines.push('');

  for (const entry of log.entries) {
    const dateStr = formatTimestamp(entry.timestamp).split(' ')[0]; // Just the date part
    lines.push(`### ${dateStr} - ${entry.type}`);
    lines.push(`**${entry.summary}**`);
    if (entry.relatedPieceIds.length > 0) {
      lines.push(`- Pieces: ${entry.relatedPieceIds.join(', ')}`);
    }
    lines.push('');
  }

  // Formula Overrides section
  lines.push('## Formula Overrides');
  lines.push('');

  for (const override of log.overrides) {
    lines.push(`### ${override.skillId} - ${override.formulaName}`);
    lines.push(`- Original: \`${override.originalValue}\``);
    lines.push(`- Override: \`${override.overrideValue}\``);
    lines.push(`- Reason: ${override.reason}`);
    lines.push('');
  }

  return lines.join('\n');
}

/** LocalStorage key for persisting design logs */
export const DESIGN_LOG_STORAGE_KEY = 'openclo:designLog';

/**
 * Manages the design log for a project.
 *
 * Tracks design decisions, constraints, and user formula overrides
 * to provide context continuity across sessions.
 */
export class DesignLogManager {
  /** Maximum number of entries to keep after flush */
  static readonly MAX_ENTRIES_AFTER_FLUSH = 10;

  private log: DesignLog;

  /**
   * Create a new DesignLogManager for a project.
   * @param projectId - The project this log belongs to
   */
  constructor(projectId: string) {
    this.log = {
      projectId,
      entries: [],
      overrides: [],
      lastFlushAt: 0,
    };
  }

  /**
   * Get the complete design log.
   * @returns The current design log state
   */
  getLog(): DesignLog {
    return this.log;
  }

  /**
   * Add a new entry to the design log.
   * @param entry - The entry to add
   */
  addEntry(entry: DesignLogEntry): void {
    this.log.entries.push(entry);
  }

  /**
   * Add or update a skill override.
   *
   * If an override for the same skill/formula combination already exists,
   * it will be replaced with the new override.
   *
   * @param override - The override to add or update
   */
  addOverride(override: SkillOverride): void {
    // Find existing override with same skill/formula
    const existingIndex = this.log.overrides.findIndex(
      o => o.skillId === override.skillId && o.formulaName === override.formulaName
    );

    if (existingIndex >= 0) {
      // Replace existing override
      this.log.overrides[existingIndex] = override;
    } else {
      // Add new override
      this.log.overrides.push(override);
    }
  }

  /**
   * Get recent entries sorted by timestamp (newest first).
   * @param count - Maximum number of entries to return
   * @returns Array of entries sorted newest first
   */
  getRecentEntries(count: number): DesignLogEntry[] {
    return [...this.log.entries]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, count);
  }

  /**
   * Serialize the design log to markdown format.
   * @returns Markdown string representation of the log
   */
  toMarkdown(): string {
    return designLogToMarkdown(this.log);
  }

  /**
   * Check if the log should be flushed based on current session tokens.
   * @param currentSessionTokens - Current token count in the session
   * @returns true if tokens are at or above TOKEN_FLUSH_THRESHOLD
   */
  shouldFlush(currentSessionTokens: number): boolean {
    return currentSessionTokens >= TOKEN_FLUSH_THRESHOLD;
  }

  /**
   * Flush the design log by compacting entries.
   *
   * Sorts entries by timestamp descending and keeps only the most recent
   * MAX_ENTRIES_AFTER_FLUSH entries. Updates lastFlushAt timestamp.
   */
  async flush(): Promise<void> {
    // Sort entries by timestamp descending (newest first)
    const sortedEntries = [...this.log.entries].sort(
      (a, b) => b.timestamp - a.timestamp
    );

    // Keep only the most recent entries
    this.log.entries = sortedEntries.slice(
      0,
      DesignLogManager.MAX_ENTRIES_AFTER_FLUSH
    );

    // Update lastFlushAt timestamp
    this.log.lastFlushAt = Date.now();
  }
}
