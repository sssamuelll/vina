import { BodyMeasurements } from '../../types/types';

export interface AvatarProfile {
  id: string;
  name: string;
  measurements: BodyMeasurements;
  modelUrl?: string;
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = 'openclo-avatar-profiles';

export function getDefaultProfiles(): AvatarProfile[] {
  const now = Date.now();
  return [
    {
      id: 'default-male',
      name: 'Standard Male',
      measurements: { height: 180, chest: 96, waist: 82, hips: 96, shoulder: 44, armLength: 64, inseam: 82 },
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'default-female',
      name: 'Standard Female',
      measurements: { height: 168, chest: 88, waist: 68, hips: 94, shoulder: 40, armLength: 59, inseam: 76 },
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'default-plus-female',
      name: 'Plus Size Female',
      measurements: { height: 168, chest: 108, waist: 88, hips: 114, shoulder: 42, armLength: 59, inseam: 76 },
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'default-petite-female',
      name: 'Petite Female',
      measurements: { height: 158, chest: 82, waist: 64, hips: 88, shoulder: 38, armLength: 55, inseam: 70 },
      createdAt: now,
      updatedAt: now,
    },
  ];
}

export function loadProfiles(): AvatarProfile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultProfiles();
    const parsed = JSON.parse(raw) as AvatarProfile[];
    return parsed.length > 0 ? parsed : getDefaultProfiles();
  } catch {
    return getDefaultProfiles();
  }
}

export function saveProfile(profile: AvatarProfile): void {
  const profiles = loadProfiles();
  const idx = profiles.findIndex(p => p.id === profile.id);
  if (idx >= 0) {
    profiles[idx] = { ...profile, updatedAt: Date.now() };
  } else {
    profiles.push(profile);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
}

export function deleteProfile(id: string): void {
  const profiles = loadProfiles().filter(p => p.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
}
