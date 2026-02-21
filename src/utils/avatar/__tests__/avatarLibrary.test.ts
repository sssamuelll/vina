import { describe, it, expect, beforeEach, vi } from 'vitest';
import { saveProfile, loadProfiles, deleteProfile, getDefaultProfiles, type AvatarProfile } from '../avatarLibrary';

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
