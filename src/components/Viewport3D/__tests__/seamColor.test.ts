import { describe, it, expect } from 'vitest';
import { seamColor } from '../SeamRenderer3D';

describe('seamColor — seam provenance coloring', () => {
  it('colors AI-proposed seams amber ("review me")', () => {
    expect(seamColor('ai')).toBe('#f59e0b');
  });

  it('colors human-sewn seams green ("confirmed")', () => {
    expect(seamColor('human')).toBe('#3fb950');
  });

  it('treats undefined provenance (legacy seams) as human', () => {
    expect(seamColor(undefined)).toBe('#3fb950');
  });
});
