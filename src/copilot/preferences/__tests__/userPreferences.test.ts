/**
 * Tests for userPreferences
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createDefaultPreferences,
  PreferenceManager,
  resetPreferenceManager,
  getPreferenceManager,
  DEFAULT_PATTERN_PREFERENCES,
  DEFAULT_UI_PREFERENCES,
} from '../userPreferences';

// Mock localStorage and window
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();

// Mock window with localStorage
Object.defineProperty(global, 'window', {
  value: { localStorage: localStorageMock },
  writable: true,
});
Object.defineProperty(global, 'localStorage', { value: localStorageMock });

describe('userPreferences', () => {
  beforeEach(() => {
    localStorageMock.clear();
    resetPreferenceManager();
    vi.clearAllMocks();
  });

  describe('createDefaultPreferences', () => {
    it('should create default preferences', () => {
      const prefs = createDefaultPreferences();

      expect(prefs.pattern).toEqual(DEFAULT_PATTERN_PREFERENCES);
      expect(prefs.ui).toEqual(DEFAULT_UI_PREFERENCES);
      expect(prefs.units).toBe('cm');
      expect(prefs.skillLevel).toBe('intermediate');
    });

    it('should have timestamps', () => {
      const prefs = createDefaultPreferences();

      expect(prefs.createdAt).toBeDefined();
      expect(prefs.updatedAt).toBeDefined();
    });
  });

  describe('PreferenceManager', () => {
    let manager: PreferenceManager;

    beforeEach(() => {
      manager = new PreferenceManager();
    });

    it('should get current preferences', () => {
      const prefs = manager.getPreferences();
      expect(prefs.units).toBe('cm');
    });

    it('should update pattern preferences', () => {
      manager.updatePatternPreferences({ defaultSeamAllowance: 15 });
      const prefs = manager.getPreferences();
      expect(prefs.pattern.defaultSeamAllowance).toBe(15);
    });

    it('should update UI preferences', () => {
      manager.updateUIPreferences({ confirmDestructive: false });
      const prefs = manager.getPreferences();
      expect(prefs.ui.confirmDestructive).toBe(false);
    });

    it('should set units', () => {
      manager.setUnits('inches');
      const prefs = manager.getPreferences();
      expect(prefs.units).toBe('inches');
    });

    it('should set skill level', () => {
      manager.setSkillLevel('expert');
      const prefs = manager.getPreferences();
      expect(prefs.skillLevel).toBe('expert');
    });

    it('should set user name', () => {
      manager.setUserName('Test User');
      const prefs = manager.getPreferences();
      expect(prefs.userName).toBe('Test User');
    });

    it('should track actions', () => {
      manager.trackAction('create_piece');
      manager.trackAction('create_piece');
      manager.trackAction('delete_piece');

      const prefs = manager.getPreferences();
      expect(prefs.stats.actionCounts['create_piece']).toBe(2);
      expect(prefs.stats.actionCounts['delete_piece']).toBe(1);
      expect(prefs.stats.totalActions).toBe(3);
    });

    it('should track garment types', () => {
      manager.trackGarmentType('t-shirt');
      manager.trackGarmentType('t-shirt');
      manager.trackGarmentType('skirt');

      const prefs = manager.getPreferences();
      expect(prefs.stats.garmentTypeCounts['t-shirt']).toBe(2);
      expect(prefs.stats.garmentTypeCounts['skirt']).toBe(1);
    });

    it('should track template usage', () => {
      manager.trackTemplateUsage('tshirt-basic');
      manager.trackTemplateUsage('tshirt-basic');

      const prefs = manager.getPreferences();
      expect(prefs.stats.templateUsage['tshirt-basic']).toBe(2);
    });

    it('should track measurement access', () => {
      manager.trackMeasurementAccess('bust');
      manager.trackMeasurementAccess('waist');

      const prefs = manager.getPreferences();
      expect(prefs.stats.measurementAccess['bust']).toBe(1);
      expect(prefs.stats.measurementAccess['waist']).toBe(1);
    });

    it('should start session', () => {
      manager.startSession();
      const prefs = manager.getPreferences();
      expect(prefs.stats.sessionCount).toBe(1);
    });

    it('should get most used actions', () => {
      manager.trackAction('a');
      manager.trackAction('a');
      manager.trackAction('a');
      manager.trackAction('b');
      manager.trackAction('b');
      manager.trackAction('c');

      const top = manager.getMostUsedActions(2);
      expect(top).toHaveLength(2);
      expect(top[0].action).toBe('a');
      expect(top[0].count).toBe(3);
      expect(top[1].action).toBe('b');
    });

    it('should get most used garment types', () => {
      manager.trackGarmentType('shirt');
      manager.trackGarmentType('shirt');
      manager.trackGarmentType('pants');

      const top = manager.getMostUsedGarmentTypes(1);
      expect(top[0].type).toBe('shirt');
      expect(top[0].count).toBe(2);
    });

    it('should get most used templates', () => {
      manager.trackTemplateUsage('template-a');
      manager.trackTemplateUsage('template-a');
      manager.trackTemplateUsage('template-b');

      const top = manager.getMostUsedTemplates(1);
      expect(top[0].templateId).toBe('template-a');
    });

    it('should reset preferences', () => {
      manager.setUnits('inches');
      manager.trackAction('test');
      manager.reset();

      const prefs = manager.getPreferences();
      expect(prefs.units).toBe('cm');
      expect(prefs.stats.totalActions).toBe(0);
    });

    it('should reset only stats', () => {
      manager.setUnits('inches');
      manager.trackAction('test');
      manager.resetStats();

      const prefs = manager.getPreferences();
      expect(prefs.units).toBe('inches');
      expect(prefs.stats.totalActions).toBe(0);
    });

    it('should notify listeners on updates', () => {
      const listener = vi.fn();
      const unsubscribe = manager.subscribe(listener);

      manager.setUnits('mm');

      expect(listener).toHaveBeenCalled();
      expect(listener.mock.calls[0][0].units).toBe('mm');

      unsubscribe();
      manager.setUnits('cm');

      // Should not be called again after unsubscribe
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should persist to localStorage', () => {
      manager.setUnits('inches');

      expect(localStorageMock.setItem).toHaveBeenCalled();
      const savedData = localStorageMock.setItem.mock.calls[localStorageMock.setItem.mock.calls.length - 1][1];
      const parsed = JSON.parse(savedData);
      expect(parsed.units).toBe('inches');
    });
  });

  describe('getPreferenceManager', () => {
    it('should return singleton instance', () => {
      const manager1 = getPreferenceManager();
      const manager2 = getPreferenceManager();

      expect(manager1).toBe(manager2);
    });

    it('should reset singleton', () => {
      const manager1 = getPreferenceManager();
      resetPreferenceManager();
      const manager2 = getPreferenceManager();

      expect(manager1).not.toBe(manager2);
    });
  });
});
