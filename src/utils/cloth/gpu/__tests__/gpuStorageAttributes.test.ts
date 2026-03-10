import { describe, it, expect } from 'vitest';
import { createPositionStorageAttribute, createNormalStorageAttribute } from '../gpuStorageAttributes';

describe('gpuStorageAttributes', () => {
  it('returns null when buffer is null', () => {
    expect(createPositionStorageAttribute(null, 100)).toBeNull();
    expect(createNormalStorageAttribute(null, 100)).toBeNull();
  });

  it('returns null when particle count is 0', () => {
    expect(createPositionStorageAttribute(null, 0)).toBeNull();
    expect(createNormalStorageAttribute(null, 0)).toBeNull();
  });
});
