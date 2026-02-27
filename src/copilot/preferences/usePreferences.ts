/**
 * React Hook for User Preferences
 *
 * Provides access to user preferences with automatic updates.
 *
 * @module usePreferences
 */

import { useState, useEffect, useCallback } from 'react';
import {
  getPreferenceManager,
  type UserPreferences,
  type PatternPreferences,
  type UIPreferences,
  type MeasurementUnit,
} from './userPreferences';

/**
 * Hook options.
 */
export interface UsePreferencesOptions {
  /** Track this session on mount */
  trackSession?: boolean;
}

/**
 * Return type for usePreferences hook.
 */
export interface UsePreferencesResult {
  /** Current preferences */
  preferences: UserPreferences;
  /** Update pattern preferences */
  updatePatternPreferences: (updates: Partial<PatternPreferences>) => void;
  /** Update UI preferences */
  updateUIPreferences: (updates: Partial<UIPreferences>) => void;
  /** Set measurement units */
  setUnits: (units: MeasurementUnit) => void;
  /** Set skill level */
  setSkillLevel: (level: UserPreferences['skillLevel']) => void;
  /** Set user name */
  setUserName: (name: string) => void;
  /** Track an action */
  trackAction: (actionType: string) => void;
  /** Track garment type usage */
  trackGarmentType: (garmentType: string) => void;
  /** Track template usage */
  trackTemplateUsage: (templateId: string) => void;
  /** Get most used actions */
  getMostUsedActions: (limit?: number) => Array<{ action: string; count: number }>;
  /** Get most used garment types */
  getMostUsedGarmentTypes: (limit?: number) => Array<{ type: string; count: number }>;
  /** Get most used templates */
  getMostUsedTemplates: (limit?: number) => Array<{ templateId: string; count: number }>;
  /** Reset all preferences */
  reset: () => void;
  /** Reset only stats */
  resetStats: () => void;
}

/**
 * Hook for accessing and updating user preferences.
 */
export function usePreferences(
  options: UsePreferencesOptions = {}
): UsePreferencesResult {
  const manager = getPreferenceManager();
  const [preferences, setPreferences] = useState<UserPreferences>(
    manager.getPreferences()
  );

  // Track session on mount if requested
  useEffect(() => {
    if (options.trackSession) {
      manager.startSession();
    }
  }, [options.trackSession]);

  // Subscribe to preference changes
  useEffect(() => {
    const unsubscribe = manager.subscribe((newPrefs) => {
      setPreferences(newPrefs);
    });
    return unsubscribe;
  }, []);

  // Memoized update functions
  const updatePatternPreferences = useCallback(
    (updates: Partial<PatternPreferences>) => {
      manager.updatePatternPreferences(updates);
    },
    []
  );

  const updateUIPreferences = useCallback(
    (updates: Partial<UIPreferences>) => {
      manager.updateUIPreferences(updates);
    },
    []
  );

  const setUnits = useCallback((units: MeasurementUnit) => {
    manager.setUnits(units);
  }, []);

  const setSkillLevel = useCallback(
    (level: UserPreferences['skillLevel']) => {
      manager.setSkillLevel(level);
    },
    []
  );

  const setUserName = useCallback((name: string) => {
    manager.setUserName(name);
  }, []);

  const trackAction = useCallback((actionType: string) => {
    manager.trackAction(actionType);
  }, []);

  const trackGarmentType = useCallback((garmentType: string) => {
    manager.trackGarmentType(garmentType);
  }, []);

  const trackTemplateUsage = useCallback((templateId: string) => {
    manager.trackTemplateUsage(templateId);
  }, []);

  const getMostUsedActions = useCallback((limit = 5) => {
    return manager.getMostUsedActions(limit);
  }, []);

  const getMostUsedGarmentTypes = useCallback((limit = 5) => {
    return manager.getMostUsedGarmentTypes(limit);
  }, []);

  const getMostUsedTemplates = useCallback((limit = 5) => {
    return manager.getMostUsedTemplates(limit);
  }, []);

  const reset = useCallback(() => {
    manager.reset();
  }, []);

  const resetStats = useCallback(() => {
    manager.resetStats();
  }, []);

  return {
    preferences,
    updatePatternPreferences,
    updateUIPreferences,
    setUnits,
    setSkillLevel,
    setUserName,
    trackAction,
    trackGarmentType,
    trackTemplateUsage,
    getMostUsedActions,
    getMostUsedGarmentTypes,
    getMostUsedTemplates,
    reset,
    resetStats,
  };
}
