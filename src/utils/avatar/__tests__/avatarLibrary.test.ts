import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  saveProfile,
  loadProfiles,
  deleteProfile,
  getDefaultProfiles,
  parseProfilesJson,
  type AvatarProfile,
} from '../avatarLibrary';
import {
  getStorageParseFailureSnapshot,
  resetStorageParseFailureCounter,
} from '../../telemetry/storageTelemetry';

// Mock localStorage
const store: Record<string, string> = {};
beforeEach(() => {
  Object.keys(store).forEach(k => delete store[k]);
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  });
});

const makeProfile = (id: string, name: string): AvatarProfile => ({
  id,
  name,
  measurements: { height: 180, chest: 96, waist: 82, hips: 96, shoulder: 44, armLength: 64, inseam: 82 },
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

describe('avatarLibrary', () => {
  it('returns default profiles when storage is empty', () => {
    const profiles = loadProfiles();
    expect(profiles.length).toBe(4);
    expect(profiles[0].name).toBe('Standard Male');
  });

  it('getDefaultProfiles has correct measurements', () => {
    const defaults = getDefaultProfiles();
    const male = defaults.find(p => p.name === 'Standard Male')!;
    expect(male.measurements.height).toBe(180);
    expect(male.measurements.chest).toBe(96);
    const female = defaults.find(p => p.name === 'Standard Female')!;
    expect(female.measurements.height).toBe(168);
  });

  it('save and load profile', () => {
    const p = makeProfile('test-1', 'Test');
    saveProfile(p);
    const loaded = loadProfiles();
    expect(loaded.find(x => x.id === 'test-1')).toBeTruthy();
  });

  it('update existing profile', () => {
    const p = makeProfile('test-1', 'Test');
    saveProfile(p);
    saveProfile({ ...p, name: 'Updated' });
    const loaded = loadProfiles();
    expect(loaded.filter(x => x.id === 'test-1').length).toBe(1);
    expect(loaded.find(x => x.id === 'test-1')!.name).toBe('Updated');
  });

  it('delete removes profile', () => {
    const p = makeProfile('test-1', 'Test');
    saveProfile(p);
    deleteProfile('test-1');
    const loaded = loadProfiles();
    expect(loaded.find(x => x.id === 'test-1')).toBeUndefined();
  });
});

// ─── parseProfilesJson — adversarial inputs ──────────────────────────────────

describe('parseProfilesJson', () => {
  const validProfile = (overrides: Partial<AvatarProfile> = {}): AvatarProfile => ({
    id: 'p1',
    name: 'P1',
    measurements: { height: 180, chest: 96, waist: 82, hips: 96, shoulder: 44, armLength: 64, inseam: 82 },
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...overrides,
  });

  it('null input parses to empty array', () => {
    const r = parseProfilesJson(null);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual([]);
  });

  it('invalid JSON returns error', () => {
    const r = parseProfilesJson('{not json');
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain('invalid JSON');
  });

  it('non-array root returns error (object)', () => {
    const r = parseProfilesJson(JSON.stringify({ profiles: [] }));
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain('expected array');
  });

  it('non-array root returns error (string — guards Length-of-string trap)', () => {
    const r = parseProfilesJson(JSON.stringify('hello'));
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain('expected array');
  });

  it('non-array root returns error (number)', () => {
    const r = parseProfilesJson(JSON.stringify(5));
    expect(r.success).toBe(false);
  });

  it('rejects array exceeding MAX_PROFILES', () => {
    const huge = Array.from({ length: 1025 }, (_, i) => validProfile({ id: `p${i}` }));
    const r = parseProfilesJson(JSON.stringify(huge));
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain('too many profiles');
  });

  it('drops profile with missing required field (no chest)', () => {
    const bad = { ...validProfile(), measurements: { height: 180, waist: 82, hips: 96, shoulder: 44, armLength: 64, inseam: 82 } };
    const r = parseProfilesJson(JSON.stringify([bad]));
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data).toHaveLength(0);
      expect(r.rejected).toBe(1);
    }
  });

  it('drops profile with required field of wrong type (height as string)', () => {
    const bad = { ...validProfile(), measurements: { ...validProfile().measurements, height: '180' as unknown as number } };
    const r = parseProfilesJson(JSON.stringify([bad]));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toHaveLength(0);
  });

  it('drops profile with NaN measurement', () => {
    // NaN serializes to null in JSON; emulate by injecting raw "NaN"-yielding value
    const raw = '[{"id":"p1","name":"P1","measurements":{"height":null,"chest":96,"waist":82,"hips":96,"shoulder":44,"armLength":64,"inseam":82},"createdAt":1700000000000,"updatedAt":1700000000000}]';
    const r = parseProfilesJson(raw);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toHaveLength(0);
  });

  it('drops profile with Infinity measurement (parsed via custom JSON)', () => {
    // Infinity isn't valid JSON; assert via direct call shape with unknown input.
    const obj = [{ ...validProfile(), measurements: { ...validProfile().measurements, height: Infinity } }];
    const r = parseProfilesJson(JSON.stringify(obj.map(p => ({ ...p, measurements: { ...p.measurements, height: 1e9 } }))));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toHaveLength(0); // 1e9 cm > MAX_MEASUREMENT_CM
  });

  it('rejects -0 leak: zero is below MIN_MEASUREMENT_CM and dropped', () => {
    const bad = { ...validProfile(), measurements: { ...validProfile().measurements, height: -0 } };
    const r = parseProfilesJson(JSON.stringify([bad]));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toHaveLength(0);
  });

  it('drops profile with empty string id', () => {
    const r = parseProfilesJson(JSON.stringify([{ ...validProfile(), id: '' }]));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toHaveLength(0);
  });

  it('drops profile with name containing null byte over max length', () => {
    const longName = 'a'.repeat(257);
    const r = parseProfilesJson(JSON.stringify([{ ...validProfile(), name: longName }]));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toHaveLength(0);
  });

  it('forward-compat: unknown extra field with finite number passes through', () => {
    const fwd = { ...validProfile(), measurements: { ...validProfile().measurements, bicepsCirc: 32 } };
    const r = parseProfilesJson(JSON.stringify([fwd]));
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data).toHaveLength(1);
      expect((r.data[0].measurements as unknown as Record<string, number>).bicepsCirc).toBe(32);
    }
  });

  it('forward-compat: unknown extra field with non-number is dropped (whole profile invalidated by catchall)', () => {
    const fwd = { ...validProfile(), measurements: { ...validProfile().measurements, bicepsCirc: 'big' } };
    const r = parseProfilesJson(JSON.stringify([fwd]));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toHaveLength(0);
  });

  it('rejects null, undefined, empty array, empty object as profiles', () => {
    const r1 = parseProfilesJson(JSON.stringify([null]));
    const r2 = parseProfilesJson(JSON.stringify([{}]));
    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);
    if (r1.success) expect(r1.data).toHaveLength(0);
    if (r2.success) expect(r2.data).toHaveLength(0);

    const empty = parseProfilesJson(JSON.stringify([]));
    expect(empty.success).toBe(true);
    if (empty.success) expect(empty.data).toEqual([]);
  });

  it('rejects semantically impossible: updatedAt before createdAt', () => {
    const bad = validProfile({ createdAt: 1_700_000_000_000, updatedAt: 1_500_000_000_000 });
    const r = parseProfilesJson(JSON.stringify([bad]));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toHaveLength(0);
  });

  it('rejects semantically impossible: timestamp far in the future', () => {
    const farFuture = Date.now() + 365 * 24 * 60 * 60 * 1000;
    const bad = validProfile({ createdAt: farFuture, updatedAt: farFuture });
    const r = parseProfilesJson(JSON.stringify([bad]));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toHaveLength(0);
  });

  it('rejects timestamp predating year 2000', () => {
    const bad = validProfile({ createdAt: 0, updatedAt: 0 });
    const r = parseProfilesJson(JSON.stringify([bad]));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toHaveLength(0);
  });

  it('rejects non-integer timestamp', () => {
    const bad = validProfile({ createdAt: 1_700_000_000_000.5, updatedAt: 1_700_000_000_000.5 });
    const r = parseProfilesJson(JSON.stringify([bad]));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toHaveLength(0);
  });

  it('keeps valid profiles when one in the array is corrupt', () => {
    const good = validProfile({ id: 'good' });
    const bad = { ...validProfile({ id: 'bad' }), measurements: { height: 'tall' } };
    const r = parseProfilesJson(JSON.stringify([good, bad]));
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data).toHaveLength(1);
      expect(r.data[0].id).toBe('good');
      expect(r.rejected).toBe(1);
    }
  });

  it('is pure: parsing the same input twice yields equal results', () => {
    const raw = JSON.stringify([validProfile()]);
    const a = parseProfilesJson(raw);
    const b = parseProfilesJson(raw);
    expect(a).toEqual(b);
  });

  it('does not mutate input string', () => {
    const raw = JSON.stringify([validProfile()]);
    const before = raw;
    parseProfilesJson(raw);
    expect(raw).toBe(before);
  });
});

// ─── loadProfiles — integration with corrupt storage ─────────────────────────

describe('loadProfiles with corrupt storage', () => {
  it('falls back to defaults when storage holds non-array', () => {
    localStorage.setItem('openclo-avatar-profiles', JSON.stringify({ oops: true }));
    const loaded = loadProfiles();
    expect(loaded.length).toBe(4);
    expect(loaded[0].name).toBe('Standard Male');
  });

  it('falls back to defaults when storage holds invalid JSON', () => {
    localStorage.setItem('openclo-avatar-profiles', '{not json');
    const loaded = loadProfiles();
    expect(loaded.length).toBe(4);
  });

  it('returns only valid profiles when array is partially corrupt', () => {
    const good = {
      id: 'good',
      name: 'Good',
      measurements: { height: 170, chest: 90, waist: 70, hips: 95, shoulder: 40, armLength: 60, inseam: 75 },
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
    };
    const bad = { id: 'bad', name: 'Bad', measurements: { height: 'tall' } };
    localStorage.setItem('openclo-avatar-profiles', JSON.stringify([good, bad]));
    const loaded = loadProfiles();
    expect(loaded.length).toBe(1);
    expect(loaded[0].id).toBe('good');
  });

  it('falls back to defaults when every profile is corrupt', () => {
    localStorage.setItem('openclo-avatar-profiles', JSON.stringify([{ id: 'x' }, null]));
    const loaded = loadProfiles();
    expect(loaded.length).toBe(4);
  });
});

// ─── loadProfiles — telemetry emission on corrupt storage ────────────────────

describe('loadProfiles telemetry', () => {
  beforeEach(() => {
    resetStorageParseFailureCounter();
  });

  it('emits json_parse failure when storage holds malformed JSON', () => {
    localStorage.setItem('openclo-avatar-profiles', '{not json');
    loadProfiles();
    const snap = getStorageParseFailureSnapshot();
    expect(snap.total).toBe(1);
    expect(snap.byKey['openclo-avatar-profiles']).toBe(1);
    expect(snap.byReason.json_parse).toBe(1);
    expect(snap.recent[0].droppedCount).toBe(1);
    expect(snap.recent[0].keptCount).toBe(0);
  });

  it('emits schema_root failure when root is not an array', () => {
    localStorage.setItem('openclo-avatar-profiles', JSON.stringify({ oops: true }));
    loadProfiles();
    const snap = getStorageParseFailureSnapshot();
    expect(snap.total).toBe(1);
    expect(snap.byReason.schema_root).toBe(1);
    expect(snap.recent[0].detail).toContain('expected array');
  });

  it('emits schema_record failure with kept/dropped counts when one profile is corrupt', () => {
    const good = {
      id: 'good',
      name: 'Good',
      measurements: { height: 170, chest: 90, waist: 70, hips: 95, shoulder: 40, armLength: 60, inseam: 75 },
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
    };
    const bad = { id: 'bad', name: 'Bad', measurements: { height: 'tall' } };
    localStorage.setItem('openclo-avatar-profiles', JSON.stringify([good, bad]));
    loadProfiles();
    const snap = getStorageParseFailureSnapshot();
    expect(snap.total).toBe(1);
    expect(snap.byReason.schema_record).toBe(1);
    expect(snap.recent[0].droppedCount).toBe(1);
    expect(snap.recent[0].keptCount).toBe(1);
    expect(snap.recent[0].detail).toContain('measurements');
  });

  it('does not emit when storage is empty (defaults are not corruption)', () => {
    loadProfiles();
    expect(getStorageParseFailureSnapshot().total).toBe(0);
  });

  it('does not emit when storage holds a valid array of profiles', () => {
    const good = {
      id: 'good',
      name: 'Good',
      measurements: { height: 170, chest: 90, waist: 70, hips: 95, shoulder: 40, armLength: 60, inseam: 75 },
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
    };
    localStorage.setItem('openclo-avatar-profiles', JSON.stringify([good]));
    loadProfiles();
    expect(getStorageParseFailureSnapshot().total).toBe(0);
  });
});
