 
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

import { safeGetItem, safeSetItem } from '../../utils/safeStorage';

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
// Preference Manager Class
// ============================================================================

/**
 * Storage key for preferences.
 */
const STORAGE_KEY = 'openclo_copilot_preferences';

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
   */
  private loadFromStorage(): UserPreferences | null {
    try {
      const stored = safeGetItem(STORAGE_KEY);
      if (!stored) return null;

      const parsed = JSON.parse(stored) as UserPreferences;
      // Merge with defaults to handle new fields
      return {
        ...createDefaultPreferences(),
        ...parsed,
        pattern: { ...DEFAULT_PATTERN_PREFERENCES, ...parsed.pattern },
        ui: { ...DEFAULT_UI_PREFERENCES, ...parsed.ui },
        stats: { ...DEFAULT_USAGE_STATS, ...parsed.stats },
      };
    } catch {
      return null;
    }
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
