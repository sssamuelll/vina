/**
 * Design Log Manager — Persistent memory for design decisions and user preferences.
 *
 * The design log captures:
 * - Design decisions made during the session
 * - Constraints that must be preserved
 * - User-defined formula overrides
 *
 * @module copilot/perception/designLog
 */

import type { DesignLog, DesignLogEntry, DesignLogEntryType, SkillOverride } from './types';

/** Token threshold for flushing log to storage */
export const TOKEN_FLUSH_THRESHOLD = 4000;

/** Keywords indicating a design decision was made */
export const DECISION_KEYWORDS = [
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
] as const;

/** Keywords indicating a constraint or rule */
export const CONSTRAINT_KEYWORDS = [
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
] as const;

/** Keywords indicating a warning or caution */
export const WARNING_KEYWORDS = [
  'warning',
  'caution',
  'issue',
  'problem',
  'risk',
  'may cause',
  'potential',
] as const;

/** Counter for generating unique entry IDs */
let entryIdCounter = 0;

/**
 * Generate a unique entry ID.
 * Combines timestamp with a counter to ensure uniqueness.
 * @returns A unique string ID
 */
export function generateEntryId(): string {
  entryIdCounter += 1;
  return `entry-${Date.now()}-${entryIdCounter}`;
}

/**
 * Extract a summary from a message.
 * Takes the first sentence, truncated to max 100 characters.
 * @param message - The full message text
 * @returns The extracted summary
 */
export function extractSummary(message: string): string {
  if (!message) {
    return '';
  }

  // Find the first sentence (ends with . or ! or ?)
  const sentenceEnd = message.search(/[.!?]/);
  let summary: string;

  if (sentenceEnd >= 0) {
    summary = message.slice(0, sentenceEnd + 1);
  } else {
    summary = message;
  }

  // Truncate to max 100 characters
  if (summary.length > 100) {
    summary = summary.slice(0, 97) + '...';
  }

  return summary;
}

/**
 * Check if a message contains any keywords from a list (case-insensitive).
 * @param message - The message to search
 * @param keywords - Array of keywords to look for
 * @returns true if any keyword is found
 */
function containsKeyword(message: string, keywords: readonly string[]): boolean {
  const lowerMessage = message.toLowerCase();
  return keywords.some(keyword => lowerMessage.includes(keyword.toLowerCase()));
}

/**
 * Extract design log entries from a message based on content analysis.
 *
 * Priority order:
 * 1. Warnings (highest priority)
 * 2. Constraints
 * 3. Decisions (tool use OR decision keywords)
 *
 * @param message - The message content to analyze
 * @param tools - Array of tool names used in this message
 * @param pieceIds - Array of piece IDs related to this message
 * @returns Array of extracted DesignLogEntry objects
 */
export function extractDecisionsFromMessage(
  message: string,
  tools: string[],
  pieceIds: string[]
): DesignLogEntry[] {
  if (!message) {
    return [];
  }

  let type: DesignLogEntryType | null = null;

  // Check warnings first (highest priority)
  if (containsKeyword(message, WARNING_KEYWORDS)) {
    type = 'warning';
  }
  // Then constraints
  else if (containsKeyword(message, CONSTRAINT_KEYWORDS)) {
    type = 'constraint';
  }
  // Then decisions (tool use OR decision keywords)
  else if (tools.length > 0 || containsKeyword(message, DECISION_KEYWORDS)) {
    type = 'decision';
  }

  // Return empty if no match
  if (!type) {
    return [];
  }

  const entry: DesignLogEntry = {
    id: generateEntryId(),
    timestamp: Date.now(),
    type,
    summary: extractSummary(message),
    relatedPieceIds: pieceIds,
  };

  return [entry];
}

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

/** LocalStorage key prefix for persisting design logs */
export const DESIGN_LOG_STORAGE_KEY = 'openclo:designLog';

/**
 * Get the storage key for a specific project.
 * @param projectId - The project ID
 * @returns The full storage key
 */
function getStorageKey(projectId: string): string {
  return `${DESIGN_LOG_STORAGE_KEY}:${projectId}`;
}

/**
 * Manages the design log for a project.
 *
 * Tracks design decisions, constraints, and user formula overrides
 * to provide context continuity across sessions.
 *
 * Supports persistence via localStorage with automatic save/load.
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
   * Load a design log from localStorage.
   * Returns a new manager with loaded data, or empty if not found.
   * @param projectId - The project ID to load
   * @returns DesignLogManager with loaded data
   */
  static load(projectId: string): DesignLogManager {
    const manager = new DesignLogManager(projectId);

    if (typeof localStorage === 'undefined') {
      return manager;
    }

    try {
      const stored = localStorage.getItem(getStorageKey(projectId));
      if (stored) {
        const parsed = JSON.parse(stored) as DesignLog;
        // Validate basic structure
        if (parsed.projectId && Array.isArray(parsed.entries) && Array.isArray(parsed.overrides)) {
          manager.log = parsed;
        }
      }
    } catch {
      // If parse fails, return empty manager
      console.warn(`[DesignLogManager] Failed to load log for project ${projectId}`);
    }

    return manager;
  }

  /**
   * Save the current design log to localStorage.
   * @returns true if save succeeded, false otherwise
   */
  save(): boolean {
    if (typeof localStorage === 'undefined') {
      return false;
    }

    try {
      const serialized = JSON.stringify(this.log);
      localStorage.setItem(getStorageKey(this.log.projectId), serialized);
      return true;
    } catch (e) {
      console.warn(`[DesignLogManager] Failed to save log:`, e);
      return false;
    }
  }

  /**
   * Clear the design log from localStorage.
   * @param projectId - The project ID to clear
   */
  static clear(projectId: string): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    try {
      localStorage.removeItem(getStorageKey(projectId));
    } catch {
      // Ignore errors
    }
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
   * Auto-saves to localStorage after adding.
   * @param entry - The entry to add
   */
  addEntry(entry: DesignLogEntry): void {
    this.log.entries.push(entry);
    this.save();
  }

  /**
   * Add or update a skill override.
   * Auto-saves to localStorage after adding.
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
    this.save();
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
   * Auto-saves to localStorage after flushing.
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

    // Persist to storage
    this.save();
  }

  /**
   * Get all entries (for serialization or debugging).
   * @returns Array of all entries
   */
  getEntries(): DesignLogEntry[] {
    return this.log.entries;
  }

  /**
   * Get all overrides.
   * @returns Array of all overrides
   */
  getOverrides(): SkillOverride[] {
    return this.log.overrides;
  }

  /**
   * Get the project ID.
   * @returns The project ID
   */
  getProjectId(): string {
    return this.log.projectId;
  }
}
