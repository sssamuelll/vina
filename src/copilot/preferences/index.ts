/**
 * User Preferences Module
 *
 * Tracks and manages user preferences for the copilot.
 *
 * @module preferences
 */

export {
  // Types
  type MeasurementUnit,
  type FitPreference,
  type PatternPreferences,
  type UIPreferences,
  type UsageStats,
  type UserPreferences,
  // Defaults
  DEFAULT_PATTERN_PREFERENCES,
  DEFAULT_UI_PREFERENCES,
  DEFAULT_USAGE_STATS,
  createDefaultPreferences,
  // Manager
  PreferenceManager,
  getPreferenceManager,
  resetPreferenceManager,
} from './userPreferences';

export {
  usePreferences,
  type UsePreferencesOptions,
  type UsePreferencesResult,
} from './usePreferences';
