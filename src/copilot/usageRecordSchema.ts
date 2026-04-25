import { z } from 'zod';
import type { UsageRecord } from './costManager';

const MAX_STRING_LEN = 200;
const MAX_RECORDS = 5_000;
// Lower bound = epoch 0; upper bound ≈ year 2100. Future-tolerant for clock skew but rejects garbage like Number.MAX_VALUE.
const MIN_TIMESTAMP_MS = 0;
const MAX_TIMESTAMP_MS = 4_102_444_800_000;

const finiteNumber = z
  .number()
  .refine(Number.isFinite, { message: 'must be finite (no NaN/Infinity)' });

const nonNegSafeInt = finiteNumber
  .refine(Number.isInteger, { message: 'must be an integer' })
  .refine((n) => n >= 0, { message: 'must be >= 0' })
  .refine((n) => n <= Number.MAX_SAFE_INTEGER, {
    message: 'exceeds Number.MAX_SAFE_INTEGER',
  });

const nonNegFinite = finiteNumber.refine((n) => n >= 0, { message: 'must be >= 0' });

const noNullByte = (s: string) => !s.includes('\0');

const boundedString = (max: number) =>
  z
    .string()
    .min(1, { message: 'must be non-empty' })
    .max(max, { message: `must be <= ${max} chars` })
    .refine(noNullByte, { message: 'contains null byte' });

const timestampMs = nonNegSafeInt
  .refine((n) => n >= MIN_TIMESTAMP_MS, { message: 'predates 1970-01-01' })
  .refine((n) => n <= MAX_TIMESTAMP_MS, { message: 'beyond year 2100' });

const UsageRecordSchema: z.ZodType<UsageRecord> = z.object({
  provider: boundedString(MAX_STRING_LEN),
  model: boundedString(MAX_STRING_LEN),
  inputTokens: nonNegSafeInt,
  outputTokens: nonNegSafeInt,
  cost: nonNegFinite,
  timestamp: timestampMs,
});

export function parseUsageRecord(input: unknown): UsageRecord {
  return UsageRecordSchema.parse(input);
}

export interface UsageRecordListResult {
  valid: UsageRecord[];
  dropped: number;
}

export function parseUsageRecordList(input: unknown): UsageRecordListResult {
  if (!Array.isArray(input)) return { valid: [], dropped: 0 };

  // Cap total work; any prefix above MAX_RECORDS counts as dropped.
  const trimmed = input.length > MAX_RECORDS ? input.slice(-MAX_RECORDS) : input;
  const overflow = input.length - trimmed.length;

  const valid: UsageRecord[] = [];
  let dropped = overflow;
  for (const item of trimmed) {
    const result = UsageRecordSchema.safeParse(item);
    if (result.success) valid.push(result.data);
    else dropped++;
  }
  return { valid, dropped };
}

export const __testing = { MAX_RECORDS, MAX_STRING_LEN, MAX_TIMESTAMP_MS };
