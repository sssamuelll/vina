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

/** LocalStorage key for persisting design logs */
export const DESIGN_LOG_STORAGE_KEY = 'openclo:designLog';

/**
 * Manages the design log for a project.
 *
 * Tracks design decisions, constraints, and user formula overrides
 * to provide context continuity across sessions.
 */
export class DesignLogManager {
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
}
