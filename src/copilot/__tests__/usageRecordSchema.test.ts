import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';
import {
  parseUsageRecord,
  parseUsageRecordList,
  __testing,
} from '../usageRecordSchema';

const validRecord = () => ({
  provider: 'anthropic',
  model: 'claude-sonnet-4-20250514',
  inputTokens: 1500,
  outputTokens: 300,
  cost: 0.009,
  timestamp: 1_700_000_000_000,
});

describe('parseUsageRecord — happy path', () => {
  it('accepts a fully valid record and returns the same shape', () => {
    const r = validRecord();
    const out = parseUsageRecord(r);
    expect(out).toEqual(r);
  });

  it('accepts cost = 0 (zero-cost ollama record)', () => {
    expect(parseUsageRecord({ ...validRecord(), cost: 0 })).toMatchObject({ cost: 0 });
  });

  it('accepts inputTokens = 0', () => {
    expect(parseUsageRecord({ ...validRecord(), inputTokens: 0 })).toMatchObject({
      inputTokens: 0,
    });
  });

  it('strips unknown extra fields silently (forward-compat)', () => {
    const r = { ...validRecord(), requestId: 'abc-123', futureField: { nested: true } };
    const out = parseUsageRecord(r);
    expect(out).toEqual(validRecord());
    expect(Object.keys(out).sort()).toEqual([
      'cost',
      'inputTokens',
      'model',
      'outputTokens',
      'provider',
      'timestamp',
    ]);
  });
});

describe('parseUsageRecord — required fields', () => {
  it('throws when provider is missing', () => {
    const { provider: _p, ...rest } = validRecord();
    expect(() => parseUsageRecord(rest)).toThrow(ZodError);
  });

  it('throws when model is missing', () => {
    const { model: _m, ...rest } = validRecord();
    expect(() => parseUsageRecord(rest)).toThrow(ZodError);
  });

  it('throws when inputTokens is missing', () => {
    const { inputTokens: _i, ...rest } = validRecord();
    expect(() => parseUsageRecord(rest)).toThrow(ZodError);
  });

  it('throws when outputTokens is missing', () => {
    const { outputTokens: _o, ...rest } = validRecord();
    expect(() => parseUsageRecord(rest)).toThrow(ZodError);
  });

  it('throws when cost is missing', () => {
    const { cost: _c, ...rest } = validRecord();
    expect(() => parseUsageRecord(rest)).toThrow(ZodError);
  });

  it('throws when timestamp is missing', () => {
    const { timestamp: _t, ...rest } = validRecord();
    expect(() => parseUsageRecord(rest)).toThrow(ZodError);
  });
});

describe('parseUsageRecord — wrong types', () => {
  it('throws when provider is a number', () => {
    expect(() => parseUsageRecord({ ...validRecord(), provider: 42 })).toThrow(ZodError);
  });

  it('throws when model is null', () => {
    expect(() => parseUsageRecord({ ...validRecord(), model: null })).toThrow(ZodError);
  });

  it('throws when inputTokens is a string ("1500")', () => {
    expect(() => parseUsageRecord({ ...validRecord(), inputTokens: '1500' })).toThrow(
      ZodError,
    );
  });

  it('throws when cost is a string', () => {
    expect(() => parseUsageRecord({ ...validRecord(), cost: '0.01' })).toThrow(ZodError);
  });

  it('throws when timestamp is an ISO string', () => {
    expect(() =>
      parseUsageRecord({ ...validRecord(), timestamp: '2026-01-15T00:00:00Z' }),
    ).toThrow(ZodError);
  });

  it('throws when inputTokens is an object', () => {
    expect(() => parseUsageRecord({ ...validRecord(), inputTokens: {} })).toThrow(ZodError);
  });
});

describe('parseUsageRecord — numeric edge cases', () => {
  it('throws when cost is NaN', () => {
    expect(() => parseUsageRecord({ ...validRecord(), cost: NaN })).toThrow(ZodError);
  });

  it('throws when inputTokens is Infinity', () => {
    expect(() =>
      parseUsageRecord({ ...validRecord(), inputTokens: Number.POSITIVE_INFINITY }),
    ).toThrow(ZodError);
  });

  it('throws when outputTokens is -Infinity', () => {
    expect(() =>
      parseUsageRecord({ ...validRecord(), outputTokens: Number.NEGATIVE_INFINITY }),
    ).toThrow(ZodError);
  });

  it('accepts inputTokens === -0 (numerically zero)', () => {
    const out = parseUsageRecord({ ...validRecord(), inputTokens: -0 });
    expect(out.inputTokens === 0).toBe(true);
    expect(Number.isFinite(out.inputTokens)).toBe(true);
  });

  it('throws when inputTokens is negative', () => {
    expect(() => parseUsageRecord({ ...validRecord(), inputTokens: -5 })).toThrow(ZodError);
  });

  it('throws when inputTokens is a float (1.5)', () => {
    expect(() => parseUsageRecord({ ...validRecord(), inputTokens: 1.5 })).toThrow(ZodError);
  });

  it('throws when inputTokens exceeds MAX_SAFE_INTEGER', () => {
    expect(() =>
      parseUsageRecord({ ...validRecord(), inputTokens: Number.MAX_SAFE_INTEGER + 2 }),
    ).toThrow(ZodError);
  });

  it('throws when cost is negative', () => {
    expect(() => parseUsageRecord({ ...validRecord(), cost: -0.001 })).toThrow(ZodError);
  });
});

describe('parseUsageRecord — string edge cases', () => {
  it('throws when provider is empty string', () => {
    expect(() => parseUsageRecord({ ...validRecord(), provider: '' })).toThrow(ZodError);
  });

  it('throws when model contains a null byte', () => {
    expect(() =>
      parseUsageRecord({ ...validRecord(), model: 'gpt\x00-4o' }),
    ).toThrow(ZodError);
  });

  it('throws when provider exceeds max length', () => {
    const huge = 'x'.repeat(__testing.MAX_STRING_LEN + 1);
    expect(() => parseUsageRecord({ ...validRecord(), provider: huge })).toThrow(ZodError);
  });

  it('accepts provider at exactly max length', () => {
    const max = 'x'.repeat(__testing.MAX_STRING_LEN);
    expect(() => parseUsageRecord({ ...validRecord(), provider: max })).not.toThrow();
  });
});

describe('parseUsageRecord — timestamp semantics', () => {
  it('throws when timestamp is negative', () => {
    expect(() => parseUsageRecord({ ...validRecord(), timestamp: -1 })).toThrow(ZodError);
  });

  it('throws when timestamp is beyond year 2100', () => {
    expect(() =>
      parseUsageRecord({ ...validRecord(), timestamp: __testing.MAX_TIMESTAMP_MS + 1 }),
    ).toThrow(ZodError);
  });

  it('throws when timestamp is a non-integer float', () => {
    expect(() =>
      parseUsageRecord({ ...validRecord(), timestamp: 1_700_000_000_000.5 }),
    ).toThrow(ZodError);
  });
});

describe('parseUsageRecord — null/undefined/empty', () => {
  it('throws on null', () => {
    expect(() => parseUsageRecord(null)).toThrow(ZodError);
  });

  it('throws on undefined', () => {
    expect(() => parseUsageRecord(undefined)).toThrow(ZodError);
  });

  it('throws on empty object', () => {
    expect(() => parseUsageRecord({})).toThrow(ZodError);
  });

  it('throws on empty array', () => {
    expect(() => parseUsageRecord([])).toThrow(ZodError);
  });

  it('throws on a string', () => {
    expect(() => parseUsageRecord('not a record')).toThrow(ZodError);
  });
});

describe('parseUsageRecord — error reporting', () => {
  it('error includes the path of the invalid field', () => {
    try {
      parseUsageRecord({ ...validRecord(), inputTokens: NaN });
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ZodError);
      const issues = (err as ZodError).issues;
      expect(issues.some((i) => i.path.includes('inputTokens'))).toBe(true);
    }
  });

  it('error does not echo the entire input record (no PII leak)', () => {
    try {
      parseUsageRecord({ ...validRecord(), provider: 42 });
      throw new Error('expected throw');
    } catch (err) {
      const msg = (err as ZodError).message;
      expect(msg).not.toContain('claude-sonnet-4-20250514');
    }
  });
});

describe('parseUsageRecordList', () => {
  it('returns empty/dropped=0 when input is not an array', () => {
    expect(parseUsageRecordList({ not: 'array' })).toEqual({ valid: [], dropped: 0 });
    expect(parseUsageRecordList(null)).toEqual({ valid: [], dropped: 0 });
    expect(parseUsageRecordList(undefined)).toEqual({ valid: [], dropped: 0 });
    expect(parseUsageRecordList('string')).toEqual({ valid: [], dropped: 0 });
  });

  it('returns empty/dropped=0 for empty array', () => {
    expect(parseUsageRecordList([])).toEqual({ valid: [], dropped: 0 });
  });

  it('returns all valid records when every item parses', () => {
    const records = [validRecord(), validRecord(), validRecord()];
    const result = parseUsageRecordList(records);
    expect(result.valid).toHaveLength(3);
    expect(result.dropped).toBe(0);
  });

  it('drops malformed records, keeps valid ones', () => {
    const records = [
      validRecord(),
      { ...validRecord(), inputTokens: 'bad' },
      validRecord(),
      { ...validRecord(), cost: NaN },
      validRecord(),
    ];
    const result = parseUsageRecordList(records);
    expect(result.valid).toHaveLength(3);
    expect(result.dropped).toBe(2);
  });

  it('caps array at MAX_RECORDS, counting overflow as dropped (keeping the tail)', () => {
    const overflow = 7;
    const total = __testing.MAX_RECORDS + overflow;
    const records = Array.from({ length: total }, (_, i) => ({
      ...validRecord(),
      timestamp: 1_700_000_000_000 + i,
    }));
    const result = parseUsageRecordList(records);
    expect(result.valid).toHaveLength(__testing.MAX_RECORDS);
    expect(result.dropped).toBe(overflow);
    // Tail is preserved (latest records survive).
    expect(result.valid.at(-1)?.timestamp).toBe(1_700_000_000_000 + total - 1);
  });

  it('never throws on hostile inputs', () => {
    const hostileInputs: unknown[] = [
      [null, undefined, 0, '', false],
      [{ __proto__: { x: 1 } }],
      [Array.from({ length: 10 }, () => ({ provider: 'p' }))],
      [{ ...validRecord(), inputTokens: NaN, cost: Infinity, timestamp: 'now' }],
    ];
    for (const input of hostileInputs) {
      expect(() => parseUsageRecordList(input)).not.toThrow();
    }
  });

  it('does not mutate the input array or items', () => {
    const a = validRecord();
    const b = { ...validRecord(), inputTokens: 'bad' };
    const input = [a, b];
    const snapshot = JSON.stringify(input);
    parseUsageRecordList(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

describe('parseUsageRecord — determinism', () => {
  it('produces identical output for identical input on repeated calls', () => {
    const r = validRecord();
    const a = parseUsageRecord(r);
    const b = parseUsageRecord(r);
    expect(a).toEqual(b);
  });
});
