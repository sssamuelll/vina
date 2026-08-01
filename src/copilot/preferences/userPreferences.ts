
/**
 * User Preferences — Track and learn from user behavior.
 *
 * Tracks:
 * - Preferred units and measurements
 * - Common actions and workflows
 * - UI preferences
 * - Pattern preferences
 *
 * @module userPreferences
 */

import { z } from 'zod';
import { safeGetItem, safeSetItem } from '../../utils/safeStorage';
import { recordStorageParseFailure } from '../../utils/telemetry/storageTelemetry';

// ============================================================================
// Types
// ============================================================================

/**
 * Measurement units preference.
 */
export type MeasurementUnit = 'cm' | 'mm' | 'inches';

/**
 * Fit level preference.
 */
export type FitPreference = 'tight' | 'fitted' | 'standard' | 'relaxed' | 'oversized';

/**
 * User preferences for pattern making.
 */
export interface PatternPreferences {
  /** Default seam allowance in mm */
  defaultSeamAllowance: number;
  /** Default fit level */
  defaultFit: FitPreference;
  /** Include seam allowance by default */
  includeSeamAllowance: boolean;
  /** Preferred fabric type */
  preferredFabricType?: string;
  /** Custom ease adjustments by area */
  customEaseAdjustments: Record<string, number>;
}

/**
 * User preferences for UI behavior.
 */
export interface UIPreferences {
  /** Confirm before destructive actions */
  confirmDestructive: boolean;
  /** Auto-detect seams after piece creation */
  autoDetectSeams: boolean;
  /** Show grid by default */
  showGrid: boolean;
  /** Default zoom level */
  defaultZoom: number;
  /** Plan execution mode preference */
  planExecutionMode: 'all' | 'step_by_step' | 'manual';
  /** Show step-by-step preview */
  showStepPreview: boolean;
}

/**
 * Tracked usage statistics.
 */
export interface UsageStats {
  /** Actions performed by type */
  actionCounts: Record<string, number>;
  /** Most used garment types */
  garmentTypeCounts: Record<string, number>;
  /** Most common measurements accessed */
  measurementAccess: Record<string, number>;
  /** Templates used */
  templateUsage: Record<string, number>;
  /** Total actions performed */
  totalActions: number;
  /** Session count */
  sessionCount: number;
  /** Last active timestamp */
  lastActiveAt: number;
}

/**
 * Complete user preferences state.
 */
export interface UserPreferences {
  /** Pattern-making preferences */
  pattern: PatternPreferences;
  /** UI preferences */
  ui: UIPreferences;
  /** Usage statistics */
  stats: UsageStats;
  /** Preferred units */
  units: MeasurementUnit;
  /** User's name (for personalization) */
  userName?: string;
  /** Skill level */
  skillLevel: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  /** Created timestamp */
  createdAt: number;
  /** Last updated timestamp */
  updatedAt: number;
}

// ============================================================================
// Default Preferences
// ============================================================================

/**
 * Default pattern preferences.
 */
export const DEFAULT_PATTERN_PREFERENCES: PatternPreferences = {
  defaultSeamAllowance: 10,
  defaultFit: 'standard',
  includeSeamAllowance: true,
  customEaseAdjustments: {},
};

/**
 * Default UI preferences.
 */
export const DEFAULT_UI_PREFERENCES: UIPreferences = {
  confirmDestructive: true,
  autoDetectSeams: true,
  showGrid: true,
  defaultZoom: 100,
  planExecutionMode: 'all',
  showStepPreview: true,
};

/**
 * Default usage stats.
 */
export const DEFAULT_USAGE_STATS: UsageStats = {
  actionCounts: {},
  garmentTypeCounts: {},
  measurementAccess: {},
  templateUsage: {},
  totalActions: 0,
  sessionCount: 0,
  lastActiveAt: Date.now(),
};

/**
 * Create default user preferences.
 */
export function createDefaultPreferences(): UserPreferences {
  return {
    pattern: { ...DEFAULT_PATTERN_PREFERENCES },
    ui: { ...DEFAULT_UI_PREFERENCES },
    stats: { ...DEFAULT_USAGE_STATS },
    units: 'cm',
    skillLevel: 'intermediate',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ============================================================================
// Validation — Parser for untrusted localStorage payloads
// ============================================================================
//
// localStorage is shared per origin and writable by other tabs, browser
// extensions, devtools, and users importing backups. A wrong-shape payload
// reaching this module silently propagates: e.g. `stats.totalActions: "5"`
// causes `+ 1` to concatenate as `"51"`, which is then re-persisted forever.
// The parser below is the single point where untrusted JSON becomes a
// strongly-typed UserPreferences. After it, the type is true by construction.
// Precedent: `src/utils/avatar/avatarLibrary.ts` (PR #593).

const MAX_STRING_LEN = 256;
const MAX_RECORD_ENTRIES = 10_000;
const MAX_COUNT = 1_000_000_000;
const MIN_TIMESTAMP_MS = Date.UTC(2000, 0, 1);
const TIMESTAMP_FUTURE_SLACK_MS = 24 * 60 * 60 * 1000;
const SEAM_ALLOWANCE_MIN_MM = 0;
const SEAM_ALLOWANCE_MAX_MM = 100;
const ZOOM_MIN = 1;
const ZOOM_MAX = 10_000;
const EASE_MIN_CM = -50;
const EASE_MAX_CM = 50;

const finiteNumber = z
  .number()
  .refine(Number.isFinite, { message: 'must be finite (no NaN/Infinity)' });

const nonNegInt = finiteNumber
  .refine(Number.isInteger, { message: 'must be an integer' })
  .refine((n) => n >= 0, { message: 'must be >= 0' })
  .refine((n) => n <= MAX_COUNT, { message: `must be <= ${MAX_COUNT}` });

// Timestamps live in epoch milliseconds (~1.7e12 today), so they must NOT
// inherit the MAX_COUNT bound used for counters. Their upper bound is
// `Date.now() + slack`; lower bound is 2000-01-01.
const timestampSchema = finiteNumber
  .refine(Number.isInteger, { message: 'must be an integer' })
  .refine((n) => n >= MIN_TIMESTAMP_MS, { message: 'predates 2000-01-01' })
  .refine((n) => n <= Date.now() + TIMESTAMP_FUTURE_SLACK_MS, {
    message: 'too far in the future',
  });

const noNullByte = (s: string) => !s.includes('\0');

const boundedString = (max: number) =>
  z
    .string()
    .max(max)
    .refine(noNullByte, { message: 'contains null byte' });

const recordKeySchema = z
  .string()
  .min(1)
  .max(MAX_STRING_LEN)
  .refine(noNullByte, { message: 'contains null byte' });

const countsRecordSchema = z
  .record(recordKeySchema, nonNegInt)
  .refine((r) => Object.keys(r).length <= MAX_RECORD_ENTRIES, {
    message: `too many entries (> ${MAX_RECORD_ENTRIES})`,
  });

const easeAdjustmentsSchema = z
  .record(
    recordKeySchema,
    finiteNumber
      .refine((n) => n >= EASE_MIN_CM, { message: `must be >= ${EASE_MIN_CM} cm` })
      .refine((n) => n <= EASE_MAX_CM, { message: `must be <= ${EASE_MAX_CM} cm` }),
  )
  .refine((r) => Object.keys(r).length <= MAX_RECORD_ENTRIES, {
    message: `too many entries (> ${MAX_RECORD_ENTRIES})`,
  });

const FitPreferenceSchema = z.enum(['tight', 'fitted', 'standard', 'relaxed', 'oversized']);
const PlanModeSchema = z.enum(['all', 'step_by_step', 'manual']);
const SkillLevelSchema = z.enum(['beginner', 'intermediate', 'advanced', 'expert']);
const UnitsSchema = z.enum(['cm', 'mm', 'inches']);

const PatternPreferencesSchema: z.ZodType<PatternPreferences> = z.object({
  defaultSeamAllowance: finiteNumber
    .refine((n) => n >= SEAM_ALLOWANCE_MIN_MM, {
      message: `must be >= ${SEAM_ALLOWANCE_MIN_MM} mm`,
    })
    .refine((n) => n <= SEAM_ALLOWANCE_MAX_MM, {
      message: `must be <= ${SEAM_ALLOWANCE_MAX_MM} mm`,
    }),
  defaultFit: FitPreferenceSchema,
  includeSeamAllowance: z.boolean(),
  preferredFabricType: boundedString(MAX_STRING_LEN).optional(),
  customEaseAdjustments: easeAdjustmentsSchema,
});

const UIPreferencesSchema: z.ZodType<UIPreferences> = z.object({
  confirmDestructive: z.boolean(),
  autoDetectSeams: z.boolean(),
  showGrid: z.boolean(),
  defaultZoom: finiteNumber
    .refine((n) => n >= ZOOM_MIN, { message: `must be >= ${ZOOM_MIN}` })
    .refine((n) => n <= ZOOM_MAX, { message: `must be <= ${ZOOM_MAX}` }),
  planExecutionMode: PlanModeSchema,
  showStepPreview: z.boolean(),
});

const UsageStatsSchema: z.ZodType<UsageStats> = z.object({
  actionCounts: countsRecordSchema,
  garmentTypeCounts: countsRecordSchema,
  measurementAccess: countsRecordSchema,
  templateUsage: countsRecordSchema,
  totalActions: nonNegInt,
  sessionCount: nonNegInt,
  lastActiveAt: timestampSchema,
});

// Section-level `.default()` covers the forward-compat case where a future
// release introduces a new section: missing => default fills in. Wrong-type
// sections (e.g. `pattern: "garbage"`) still fail and reset to full defaults.
// New leaf fields added later MUST be `.optional()` or carry `.default(...)`
// to preserve forward-compat with older saves.
const UserPreferencesSchema = z
  .object({
    pattern: PatternPreferencesSchema.default(() => ({ ...DEFAULT_PATTERN_PREFERENCES })),
    ui: UIPreferencesSchema.default(() => ({ ...DEFAULT_UI_PREFERENCES })),
    stats: UsageStatsSchema.default(() => ({ ...DEFAULT_USAGE_STATS, lastActiveAt: Date.now() })),
    units: UnitsSchema.default('cm'),
    userName: boundedString(MAX_STRING_LEN).optional(),
    skillLevel: SkillLevelSchema.default('intermediate'),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .superRefine((p, ctx) => {
    if (p.updatedAt < p.createdAt) {
      ctx.addIssue({
        code: 'custom',
        path: ['updatedAt'],
        message: 'updatedAt < createdAt',
      });
    }
  });

/**
 * Parse an untrusted value (e.g. result of `JSON.parse` over localStorage)
 * into a strongly-typed `UserPreferences`. Returns `null` on any structural or
 * range failure; callers are expected to fall back to `createDefaultPreferences()`.
 *
 * Pure and deterministic except for the timestamp upper-bound check, which
 * reads `Date.now()` to detect future-dated entries. Does not mutate input.
 */
export function parseUserPreferences(
  input: unknown,
  onIssue?: (detail: string) => void,
): UserPreferences | null {
  const result = UserPreferencesSchema.safeParse(input);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const path = issue?.path.length ? issue.path.join('.') : '<root>';
  const message = issue?.message ?? 'unknown error';
  const detail = `${path} — ${message}`;
  onIssue?.(detail);
  console.warn(`[userPreferences] dropped corrupt preferences: ${detail}`);
  return null;
}

// ============================================================================
// Preference Manager Class
// ============================================================================

/**
 * Storage key for preferences.
 */
const STORAGE_KEY = 'vina_copilot_preferences';

/**
 * Manages user preferences with persistence.
 */
export class PreferenceManager {
  private preferences: UserPreferences;
  private listeners: Set<(prefs: UserPreferences) => void> = new Set();

  constructor() {
    this.preferences = this.loadFromStorage() || createDefaultPreferences();
  }

  /**
   * Get current preferences.
   */
  getPreferences(): UserPreferences {
    return { ...this.preferences };
  }

  /**
   * Update pattern preferences.
   */
  updatePatternPreferences(updates: Partial<PatternPreferences>): void {
    this.preferences = {
      ...this.preferences,
      pattern: { ...this.preferences.pattern, ...updates },
      updatedAt: Date.now(),
    };
    this.persist();
    this.notifyListeners();
  }

  /**
   * Update UI preferences.
   */
  updateUIPreferences(updates: Partial<UIPreferences>): void {
    this.preferences = {
      ...this.preferences,
      ui: { ...this.preferences.ui, ...updates },
      updatedAt: Date.now(),
    };
    this.persist();
    this.notifyListeners();
  }

  /**
   * Set preferred units.
   */
  setUnits(units: MeasurementUnit): void {
    this.preferences = {
      ...this.preferences,
      units,
      updatedAt: Date.now(),
    };
    this.persist();
    this.notifyListeners();
  }

  /**
   * Set skill level.
   */
  setSkillLevel(level: UserPreferences['skillLevel']): void {
    this.preferences = {
      ...this.preferences,
      skillLevel: level,
      updatedAt: Date.now(),
    };
    this.persist();
    this.notifyListeners();
  }

  /**
   * Set user name.
   */
  setUserName(name: string): void {
    this.preferences = {
      ...this.preferences,
      userName: name,
      updatedAt: Date.now(),
    };
    this.persist();
    this.notifyListeners();
  }

  // === Stats Tracking ===

  /**
   * Track an action being performed.
   */
  trackAction(actionType: string): void {
    const counts = { ...this.preferences.stats.actionCounts };
    counts[actionType] = (counts[actionType] || 0) + 1;

    this.preferences = {
      ...this.preferences,
      stats: {
        ...this.preferences.stats,
        actionCounts: counts,
        totalActions: this.preferences.stats.totalActions + 1,
        lastActiveAt: Date.now(),
      },
      updatedAt: Date.now(),
    };
    this.persist();
  }

  /**
   * Track garment type usage.
   */
  trackGarmentType(garmentType: string): void {
    const counts = { ...this.preferences.stats.garmentTypeCounts };
    counts[garmentType] = (counts[garmentType] || 0) + 1;

    this.preferences = {
      ...this.preferences,
      stats: {
        ...this.preferences.stats,
        garmentTypeCounts: counts,
      },
      updatedAt: Date.now(),
    };
    this.persist();
  }

  /**
   * Track template usage.
   */
  trackTemplateUsage(templateId: string): void {
    const counts = { ...this.preferences.stats.templateUsage };
    counts[templateId] = (counts[templateId] || 0) + 1;

    this.preferences = {
      ...this.preferences,
      stats: {
        ...this.preferences.stats,
        templateUsage: counts,
      },
      updatedAt: Date.now(),
    };
    this.persist();
  }

  /**
   * Track measurement access.
   */
  trackMeasurementAccess(measurement: string): void {
    const counts = { ...this.preferences.stats.measurementAccess };
    counts[measurement] = (counts[measurement] || 0) + 1;

    this.preferences = {
      ...this.preferences,
      stats: {
        ...this.preferences.stats,
        measurementAccess: counts,
      },
      updatedAt: Date.now(),
    };
    this.persist();
  }

  /**
   * Start a new session.
   */
  startSession(): void {
    this.preferences = {
      ...this.preferences,
      stats: {
        ...this.preferences.stats,
        sessionCount: this.preferences.stats.sessionCount + 1,
        lastActiveAt: Date.now(),
      },
      updatedAt: Date.now(),
    };
    this.persist();
  }

  // === Analytics ===

  /**
   * Get the most used actions.
   */
  getMostUsedActions(limit = 5): Array<{ action: string; count: number }> {
    return Object.entries(this.preferences.stats.actionCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([action, count]) => ({ action, count }));
  }

  /**
   * Get the most used garment types.
   */
  getMostUsedGarmentTypes(limit = 5): Array<{ type: string; count: number }> {
    return Object.entries(this.preferences.stats.garmentTypeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([type, count]) => ({ type, count }));
  }

  /**
   * Get the most used templates.
   */
  getMostUsedTemplates(limit = 5): Array<{ templateId: string; count: number }> {
    return Object.entries(this.preferences.stats.templateUsage)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([templateId, count]) => ({ templateId, count }));
  }

  // === Persistence ===

  /**
   * Load preferences from storage.
   *
   * The blob is untrusted (other tabs, extensions, devtools, version skew),
   * so it goes through `parseUserPreferences` which returns `null` for any
   * structural or range failure. The caller fully resets to defaults rather
   * than half-merging garbage; partial recovery would silently corrupt stats
   * and re-persist the corruption on the next write.
   */
  private loadFromStorage(): UserPreferences | null {
    const stored = safeGetItem(STORAGE_KEY);
    if (!stored) return null;
    let raw: unknown;
    try {
      raw = JSON.parse(stored);
    } catch (e) {
      recordStorageParseFailure({
        key: STORAGE_KEY,
        reason: 'json_parse',
        droppedCount: 1,
        keptCount: 0,
        detail: (e as Error).message,
      });
      return null;
    }
    let issueDetail: string | undefined;
    const parsed = parseUserPreferences(raw, (d) => { issueDetail = d; });
    if (parsed === null) {
      recordStorageParseFailure({
        key: STORAGE_KEY,
        reason: 'schema_root',
        droppedCount: 1,
        keptCount: 0,
        detail: issueDetail,
      });
    }
    return parsed;
  }

  /**
   * Save preferences to storage.
   */
  private persist(): void {
    safeSetItem(STORAGE_KEY, JSON.stringify(this.preferences));
  }

  // === Listeners ===

  /**
   * Subscribe to preference changes.
   */
  subscribe(listener: (prefs: UserPreferences) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Notify all listeners of changes.
   */
  private notifyListeners(): void {
    const prefs = this.getPreferences();
    this.listeners.forEach(listener => listener(prefs));
  }

  // === Reset ===

  /**
   * Reset all preferences to defaults.
   */
  reset(): void {
    this.preferences = createDefaultPreferences();
    this.persist();
    this.notifyListeners();
  }

  /**
   * Reset only statistics.
   */
  resetStats(): void {
    this.preferences = {
      ...this.preferences,
      stats: { ...DEFAULT_USAGE_STATS },
      updatedAt: Date.now(),
    };
    this.persist();
    this.notifyListeners();
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let preferenceManagerInstance: PreferenceManager | null = null;

/**
 * Get the preference manager singleton.
 */
export function getPreferenceManager(): PreferenceManager {
  if (!preferenceManagerInstance) {
    preferenceManagerInstance = new PreferenceManager();
  }
  return preferenceManagerInstance;
}

/**
 * Reset the preference manager (for testing).
 */
export function resetPreferenceManager(): void {
  preferenceManagerInstance = null;
}

// ============================================================================
// React Hook
// ============================================================================

/**
 * Hook options.
 */
export interface UsePreferencesOptions {
  /** Track this session on mount */
  trackSession?: boolean;
}

/**
 * Create a preferences hook (call this to create the hook).
 * Usage: const usePreferences = createPreferencesHook();
 */
export function createPreferencesHook() {
  // This would be the actual React hook implementation
  // but we can't import React here without adding it as a dependency
  // The actual hook would be in a separate file
  return function usePreferences(_options: UsePreferencesOptions = {}) {
    const manager = getPreferenceManager();
    return {
      preferences: manager.getPreferences(),
      updatePatternPreferences: manager.updatePatternPreferences.bind(manager),
      updateUIPreferences: manager.updateUIPreferences.bind(manager),
      setUnits: manager.setUnits.bind(manager),
      setSkillLevel: manager.setSkillLevel.bind(manager),
      trackAction: manager.trackAction.bind(manager),
      trackGarmentType: manager.trackGarmentType.bind(manager),
      trackTemplateUsage: manager.trackTemplateUsage.bind(manager),
      getMostUsedActions: manager.getMostUsedActions.bind(manager),
      getMostUsedGarmentTypes: manager.getMostUsedGarmentTypes.bind(manager),
      getMostUsedTemplates: manager.getMostUsedTemplates.bind(manager),
      reset: manager.reset.bind(manager),
    };
  };
}
