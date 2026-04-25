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
  DEFAULT_USAGE_STATS,
  parseUserPreferences,
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

// ─── Parser tests ────────────────────────────────────────────────────────────
// `parseUserPreferences` is the boundary between untrusted localStorage JSON
// and the strongly-typed UserPreferences fed to the rest of the app. Tests
// below all fail against the previous `JSON.parse(...) as UserPreferences`
// implementation, which silently accepted any shape.

function validRaw(): Record<string, unknown> {
  const now = Date.now();
  return {
    pattern: { ...DEFAULT_PATTERN_PREFERENCES },
    ui: { ...DEFAULT_UI_PREFERENCES },
    stats: { ...DEFAULT_USAGE_STATS, lastActiveAt: now },
    units: 'cm',
    skillLevel: 'intermediate',
    createdAt: now,
    updatedAt: now,
  };
}

describe('parseUserPreferences', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    warnSpy.mockClear();
  });

  // ── happy path ────────────────────────────────────────────────────────────
  it('accepts a fully valid payload and produces a strongly typed result', () => {
    const result = parseUserPreferences(validRaw());
    expect(result).not.toBeNull();
    expect(result?.units).toBe('cm');
    expect(result?.pattern.defaultSeamAllowance).toBe(10);
    expect(result?.stats.totalActions).toBe(0);
  });

  it('round-trips createDefaultPreferences', () => {
    const defaults = createDefaultPreferences();
    const result = parseUserPreferences(JSON.parse(JSON.stringify(defaults)));
    expect(result).toEqual(defaults);
  });

  // ── (1) required field absent ─────────────────────────────────────────────
  it('rejects missing required field createdAt', () => {
    const raw = validRaw();
    delete raw.createdAt;
    expect(parseUserPreferences(raw)).toBeNull();
  });

  it('rejects missing required leaf stats.totalActions', () => {
    const raw = validRaw();
    delete (raw.stats as Record<string, unknown>).totalActions;
    expect(parseUserPreferences(raw)).toBeNull();
  });

  // ── (2) required field wrong type ─────────────────────────────────────────
  it('rejects stats.totalActions as a string ("5") — the silent-corruption case', () => {
    const raw = validRaw();
    (raw.stats as Record<string, unknown>).totalActions = '5';
    expect(parseUserPreferences(raw)).toBeNull();
  });

  it('rejects pattern as a primitive instead of an object', () => {
    const raw = validRaw();
    raw.pattern = 'garbage';
    expect(parseUserPreferences(raw)).toBeNull();
  });

  it('rejects stats as a string (would spread chars under the old merge)', () => {
    const raw = validRaw();
    raw.stats = 'corrupted';
    expect(parseUserPreferences(raw)).toBeNull();
  });

  it('rejects skillLevel outside the allowed enum', () => {
    const raw = validRaw();
    raw.skillLevel = 'god-mode';
    expect(parseUserPreferences(raw)).toBeNull();
  });

  it('rejects actionCounts as an array (typeof object but iterable)', () => {
    const raw = validRaw();
    (raw.stats as Record<string, unknown>).actionCounts = [1, 2, 3];
    expect(parseUserPreferences(raw)).toBeNull();
  });

  // ── (3) numeric: NaN / Infinity / -0 ──────────────────────────────────────
  it('rejects NaN for stats.totalActions', () => {
    const raw = validRaw();
    (raw.stats as Record<string, unknown>).totalActions = Number.NaN;
    expect(parseUserPreferences(raw)).toBeNull();
  });

  it('rejects Infinity for stats.lastActiveAt', () => {
    const raw = validRaw();
    (raw.stats as Record<string, unknown>).lastActiveAt = Number.POSITIVE_INFINITY;
    expect(parseUserPreferences(raw)).toBeNull();
  });

  it('accepts -0 for an integer count (Object.is(-0, 0) === false but value == 0)', () => {
    const raw = validRaw();
    (raw.stats as Record<string, unknown>).totalActions = -0;
    const result = parseUserPreferences(raw);
    expect(result).not.toBeNull();
    // .toBe uses Object.is which distinguishes ±0; equality / arithmetic does not.
    expect(result?.stats.totalActions === 0).toBe(true);
  });

  it('rejects negative integer for a count', () => {
    const raw = validRaw();
    (raw.stats as Record<string, unknown>).sessionCount = -1;
    expect(parseUserPreferences(raw)).toBeNull();
  });

  it('rejects non-integer (3.5) for an integer count', () => {
    const raw = validRaw();
    (raw.stats as Record<string, unknown>).totalActions = 3.5;
    expect(parseUserPreferences(raw)).toBeNull();
  });

  it('rejects defaultSeamAllowance above the physical bound', () => {
    const raw = validRaw();
    (raw.pattern as Record<string, unknown>).defaultSeamAllowance = 1000;
    expect(parseUserPreferences(raw)).toBeNull();
  });

  it('rejects defaultZoom below the minimum', () => {
    const raw = validRaw();
    (raw.ui as Record<string, unknown>).defaultZoom = 0;
    expect(parseUserPreferences(raw)).toBeNull();
  });

  // ── (4) strings: empty, null byte, over max length ────────────────────────
  it('rejects empty record key in actionCounts', () => {
    const raw = validRaw();
    (raw.stats as Record<string, unknown>).actionCounts = { '': 1 };
    expect(parseUserPreferences(raw)).toBeNull();
  });

  it('rejects record key containing a null byte', () => {
    const raw = validRaw();
    (raw.stats as Record<string, unknown>).actionCounts = { ['ab\u0000cd']: 1 };
    expect(parseUserPreferences(raw)).toBeNull();
  });

  it('rejects userName longer than 256 chars', () => {
    const raw = validRaw();
    raw.userName = 'a'.repeat(257);
    expect(parseUserPreferences(raw)).toBeNull();
  });

  it('rejects record value with > 10000 entries (DoS guard)', () => {
    const raw = validRaw();
    const counts: Record<string, number> = {};
    for (let i = 0; i < 10_001; i++) counts[`k${i}`] = 1;
    (raw.stats as Record<string, unknown>).actionCounts = counts;
    expect(parseUserPreferences(raw)).toBeNull();
  });

  // ── (5) unknown extra keys: stripped silently (per design 2.d) ────────────
  it('strips unknown root-level keys silently', () => {
    const raw = { ...validRaw(), unknownExtra: 'ignored' };
    const result = parseUserPreferences(raw);
    expect(result).not.toBeNull();
    expect(result as unknown as Record<string, unknown>).not.toHaveProperty('unknownExtra');
  });

  it('strips unknown keys inside a section', () => {
    const raw = validRaw();
    (raw.pattern as Record<string, unknown>).rogueField = 42;
    const result = parseUserPreferences(raw);
    expect(result).not.toBeNull();
    expect(result?.pattern as unknown as Record<string, unknown>).not.toHaveProperty('rogueField');
  });

  // ── (6) null / undefined / empty array / empty object ─────────────────────
  it('rejects null', () => {
    expect(parseUserPreferences(null)).toBeNull();
  });

  it('rejects undefined', () => {
    expect(parseUserPreferences(undefined)).toBeNull();
  });

  it('rejects an empty array', () => {
    expect(parseUserPreferences([])).toBeNull();
  });

  it('rejects an empty object (missing required createdAt/updatedAt)', () => {
    expect(parseUserPreferences({})).toBeNull();
  });

  // ── (7) semantically impossible ───────────────────────────────────────────
  it('rejects updatedAt < createdAt', () => {
    const raw = validRaw();
    raw.createdAt = Date.now();
    raw.updatedAt = (raw.createdAt as number) - 1000;
    expect(parseUserPreferences(raw)).toBeNull();
  });

  it('rejects timestamp far in the future', () => {
    const raw = validRaw();
    raw.createdAt = Date.now() + 365 * 24 * 60 * 60 * 1000;
    raw.updatedAt = raw.createdAt;
    expect(parseUserPreferences(raw)).toBeNull();
  });

  it('rejects timestamp predating year 2000', () => {
    const raw = validRaw();
    raw.createdAt = 0;
    expect(parseUserPreferences(raw)).toBeNull();
  });

  // ── forward-compat (section default fills missing) ────────────────────────
  it('fills a missing section with defaults (forward-compat for added sections)', () => {
    const raw = validRaw();
    delete raw.pattern;
    const result = parseUserPreferences(raw);
    expect(result).not.toBeNull();
    expect(result?.pattern).toEqual(DEFAULT_PATTERN_PREFERENCES);
  });

  // ── purity / determinism ──────────────────────────────────────────────────
  it('does not mutate input', () => {
    const raw = validRaw();
    const snapshot = JSON.parse(JSON.stringify(raw));
    parseUserPreferences(raw);
    expect(raw).toEqual(snapshot);
  });

  it('is deterministic for identical input', () => {
    const raw = validRaw();
    const a = parseUserPreferences(raw);
    const b = parseUserPreferences(raw);
    expect(a).toEqual(b);
  });

  it('logs a warning with a path when rejecting', () => {
    parseUserPreferences({ ...validRaw(), skillLevel: 'wrong' });
    expect(warnSpy).toHaveBeenCalled();
    const msg = warnSpy.mock.calls[0]?.[0] as string;
    expect(msg).toMatch(/skillLevel/);
  });

  it('does not leak the input value into the warning message', () => {
    parseUserPreferences({ ...validRaw(), userName: 'hunter2-secret-token' });
    // userName is valid here; this guards the inverse: when invalid, the
    // warning carries the path + reason but never the offending value.
    parseUserPreferences({ ...validRaw(), userName: 'a'.repeat(1000) });
    for (const call of warnSpy.mock.calls) {
      const msg = String(call[0] ?? '');
      expect(msg).not.toContain('hunter2-secret-token');
    }
  });
});

// ─── Manager fallback when storage is corrupt ────────────────────────────────

describe('PreferenceManager corrupt-storage fallback', () => {
  beforeEach(() => {
    localStorageMock.clear();
    resetPreferenceManager();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('falls back to defaults when localStorage holds wrong-shape JSON', () => {
    localStorageMock.setItem(
      'openclo_copilot_preferences',
      JSON.stringify({ stats: { totalActions: '5' }, units: 'cm' }),
    );
    const manager = new PreferenceManager();
    const prefs = manager.getPreferences();
    expect(prefs.stats.totalActions).toBe(0);
    expect(prefs.units).toBe('cm');
    expect(prefs.skillLevel).toBe('intermediate');
  });

  it('falls back to defaults when localStorage holds invalid JSON', () => {
    localStorageMock.setItem('openclo_copilot_preferences', '{not json');
    const manager = new PreferenceManager();
    expect(manager.getPreferences().stats.totalActions).toBe(0);
  });

  it('does not concatenate string totals after corrupt-storage recovery', () => {
    // The motivating bug: old code accepted stats.totalActions = "5" and the
    // next trackAction() produced "51" (string concat), persisted forever.
    localStorageMock.setItem(
      'openclo_copilot_preferences',
      JSON.stringify({
        ...createDefaultPreferences(),
        stats: { ...DEFAULT_USAGE_STATS, totalActions: '5' },
      }),
    );
    const manager = new PreferenceManager();
    manager.trackAction('foo');
    const prefs = manager.getPreferences();
    expect(typeof prefs.stats.totalActions).toBe('number');
    expect(prefs.stats.totalActions).toBe(1);
  });

  it('does not corrupt action ranking after a string actionCounts on disk', () => {
    // Old behavior: `{ ...DEFAULT_USAGE_STATS, ...'abc' }` spread the string
    // by index, leaving `{ '0':'a', '1':'b', '2':'c', ... }`. trackAction
    // then ranked phantom keys "0"/"1"/"2" alongside the real one.
    localStorageMock.setItem(
      'openclo_copilot_preferences',
      JSON.stringify({
        ...createDefaultPreferences(),
        stats: { ...DEFAULT_USAGE_STATS, actionCounts: 'abc' },
      }),
    );
    const manager = new PreferenceManager();
    manager.trackAction('foo');
    manager.trackAction('foo');
    const top = manager.getMostUsedActions(5);
    expect(top).toHaveLength(1);
    expect(top[0].action).toBe('foo');
    expect(top[0].count).toBe(2);
  });
});
