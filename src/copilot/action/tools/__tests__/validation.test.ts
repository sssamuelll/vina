import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { validateToolParams, ModifyDimensionSchema, CreatePieceSchema } from '../validation';

describe('validateToolParams', () => {
  it('returns success with valid data', () => {
    const schema = z.object({ name: z.string() });
    const result = validateToolParams(schema, { name: 'test' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('test');
    }
  });

  it('returns error with invalid data', () => {
    const schema = z.object({ name: z.string() });
    const result = validateToolParams(schema, { name: 123 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('string');
    }
  });
});

describe('ModifyDimensionSchema', () => {
  it('validates correct params', () => {
    const result = validateToolParams(ModifyDimensionSchema, {
      pieceId: 'front',
      edgeName: 'neckline',
      delta: -20,
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing pieceId', () => {
    const result = validateToolParams(ModifyDimensionSchema, {
      edgeName: 'neckline',
      delta: -20,
    });
    expect(result.success).toBe(false);
  });
});

describe('CreatePieceSchema', () => {
  it('validates correct params', () => {
    const result = validateToolParams(CreatePieceSchema, {
      name: 'front-panel',
      outline: [
        { type: 'M', values: [0, 0] },
        { type: 'L', values: [100, 0] },
        { type: 'L', values: [100, 200] },
        { type: 'L', values: [0, 200] },
        { type: 'Z', values: [] },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing name', () => {
    const result = validateToolParams(CreatePieceSchema, {
      outline: [{ type: 'M', values: [0, 0] }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid outline type', () => {
    const result = validateToolParams(CreatePieceSchema, {
      name: 'test',
      outline: [{ type: 'X', values: [0, 0] }],
    });
    expect(result.success).toBe(false);
  });
});
