import { z } from 'zod';
import type { BodyMeasurements } from '../../types/types';
import { safeGetItem, safeSetItem } from '../safeStorage';
import { recordStorageParseFailure } from '../telemetry/storageTelemetry';

export interface AvatarProfile {
  id: string;
  name: string;
  measurements: BodyMeasurements;
  modelUrl?: string;
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = 'openclo-avatar-profiles';

// ─── Validation bounds ───────────────────────────────────────────────────────
// String caps protect against quota exhaustion / DoS via crafted localStorage.
// Numeric caps cover real human anthropometrics with generous slack; values
// outside these ranges propagating into the parametric solver produce NaN
// pattern points and corrupt the cloth simulator.
const MAX_ID_LEN = 256;
const MAX_NAME_LEN = 256;
const MAX_MODEL_URL_LEN = 4096;
const MAX_PROFILES = 1024;
// Centimeters. Smallest known adult height ~55cm; tallest ~272cm. Largest
// recorded waist ~302cm. 5..500 covers the realistic envelope plus margin.
const MIN_MEASUREMENT_CM = 5;
const MAX_MEASUREMENT_CM = 500;
// Reject timestamps before 2000-01-01 (predates the project) and beyond
// 1 day in the future at parse time (clock skew tolerance).
const MIN_TIMESTAMP_MS = Date.UTC(2000, 0, 1);

// ─── Required vs optional measurement keys ───────────────────────────────────
// Keep in sync with BodyMeasurements in src/types/types.ts. New optional
// fields are accepted as passthrough when finite (forward-compat); see
// MeasurementsSchema below.
const REQUIRED_MEASUREMENT_KEYS = [
  'height', 'chest', 'waist', 'hips', 'shoulder', 'armLength', 'inseam',
] as const;

// ─── Schemas ─────────────────────────────────────────────────────────────────

const measurementValueSchema = z
  .number()
  .refine(Number.isFinite, { message: 'must be finite (no NaN/Infinity)' })
  .refine(
    (v) => v >= MIN_MEASUREMENT_CM && v <= MAX_MEASUREMENT_CM,
    { message: `must be within [${MIN_MEASUREMENT_CM}, ${MAX_MEASUREMENT_CM}] cm` },
  );

const requiredShape = REQUIRED_MEASUREMENT_KEYS.reduce<Record<string, typeof measurementValueSchema>>(
  (acc, key) => { acc[key] = measurementValueSchema; return acc; },
  {},
);

// catchall(): unknown extra keys must also be finite numbers in range, OR
// they are dropped. We can't reject them outright (forward-compat with newer
// app versions writing fields this version doesn't know), but we will not let
// non-numeric values through to the parametric solver which reads
// `Record<string, number>`.
const MeasurementsSchema = z
  .object(requiredShape)
  .catchall(measurementValueSchema)
  .transform((m) => {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(m)) {
      if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    }
    return out as unknown as BodyMeasurements;
  });

const timestampSchema = z
  .number()
  .int()
  .refine(Number.isFinite, { message: 'must be finite' })
  .refine((t) => t >= MIN_TIMESTAMP_MS, { message: 'too far in the past' });

const ProfileSchema = z
  .object({
    id: z.string().min(1).max(MAX_ID_LEN),
    name: z.string().min(1).max(MAX_NAME_LEN),
    measurements: MeasurementsSchema,
    modelUrl: z.string().max(MAX_MODEL_URL_LEN).optional(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .superRefine((p, ctx) => {
    if (p.updatedAt < p.createdAt) {
      ctx.addIssue({ code: 'custom', message: 'updatedAt < createdAt' });
    }
    const nowPlusOneDay = Date.now() + 24 * 60 * 60 * 1000;
    if (p.createdAt > nowPlusOneDay) {
      ctx.addIssue({ code: 'custom', path: ['createdAt'], message: 'too far in the future' });
    }
    if (p.updatedAt > nowPlusOneDay) {
      ctx.addIssue({ code: 'custom', path: ['updatedAt'], message: 'too far in the future' });
    }
  });

// ─── Parser ──────────────────────────────────────────────────────────────────

export type ParseProfilesResult =
  | { success: true; data: AvatarProfile[]; rejected: number; firstRejectDetail?: string }
  | { success: false; error: string; reason: 'json_parse' | 'schema_root' };

/**
 * Parse a localStorage value (already string-decoded or null) into a validated
 * array of profiles. Pure and deterministic for identical input. Does not
 * mutate the input. Per-profile failures are collected so a single corrupt
 * entry does not erase the user's other valid profiles.
 */
export function parseProfilesJson(raw: string | null): ParseProfilesResult {
  if (raw === null) return { success: true, data: [], rejected: 0 };
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    return { success: false, error: `invalid JSON: ${(e as Error).message}`, reason: 'json_parse' };
  }
  if (!Array.isArray(json)) {
    return { success: false, error: `root: expected array, got ${typeofDescription(json)}`, reason: 'schema_root' };
  }
  if (json.length > MAX_PROFILES) {
    return { success: false, error: `root: too many profiles (${json.length} > ${MAX_PROFILES})`, reason: 'schema_root' };
  }
  const valid: AvatarProfile[] = [];
  let rejected = 0;
  let firstRejectDetail: string | undefined;
  for (let i = 0; i < json.length; i++) {
    const result = ProfileSchema.safeParse(json[i]);
    if (result.success) {
      valid.push(result.data);
    } else {
      rejected++;
      const issue = result.error.issues[0];
      const path = issue?.path.join('.') || '<root>';
      const message = issue?.message ?? 'unknown error';
      if (firstRejectDetail === undefined) {
        firstRejectDetail = `${path} — ${message}`;
      }
      console.warn(`[avatarLibrary] dropped profile at index ${i}: ${path} — ${message}`);
    }
  }
  return { success: true, data: valid, rejected, firstRejectDetail };
}

function typeofDescription(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

// ─── Defaults ────────────────────────────────────────────────────────────────

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

// ─── Public API ──────────────────────────────────────────────────────────────

export function loadProfiles(): AvatarProfile[] {
  const raw = safeGetItem(STORAGE_KEY);
  const result = parseProfilesJson(raw);
  if (!result.success) {
    recordStorageParseFailure({
      key: STORAGE_KEY,
      reason: result.reason,
      droppedCount: 1,
      keptCount: 0,
      detail: result.error,
    });
    console.warn(`[avatarLibrary] resetting profiles: ${result.error}`);
    return getDefaultProfiles();
  }
  if (result.rejected > 0) {
    recordStorageParseFailure({
      key: STORAGE_KEY,
      reason: 'schema_record',
      droppedCount: result.rejected,
      keptCount: result.data.length,
      detail: result.firstRejectDetail,
    });
    console.warn(`[avatarLibrary] dropped ${result.rejected} corrupt profile(s) from storage`);
  }
  return result.data.length > 0 ? result.data : getDefaultProfiles();
}

export function saveProfile(profile: AvatarProfile): void {
  const profiles = loadProfiles();
  const idx = profiles.findIndex(p => p.id === profile.id);
  if (idx >= 0) {
    profiles[idx] = { ...profile, updatedAt: Date.now() };
  } else {
    profiles.push(profile);
  }
  // Write to both IndexedDB and localStorage
  import('../storage').then(({ storageSet }) => { storageSet('avatars', 'profiles', profiles); });
  safeSetItem(STORAGE_KEY, JSON.stringify(profiles));
}

export function deleteProfile(id: string): void {
  const profiles = loadProfiles().filter(p => p.id !== id);
  import('../storage').then(({ storageSet }) => { storageSet('avatars', 'profiles', profiles); });
  safeSetItem(STORAGE_KEY, JSON.stringify(profiles));
}
