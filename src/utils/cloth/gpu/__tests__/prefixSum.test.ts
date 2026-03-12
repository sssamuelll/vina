import { describe, it, expect } from 'vitest';
import { serialPrefixSum } from '../prefixSumCpu';

describe('serialPrefixSum (CPU reference for WGSL)', () => {
  it('computes exclusive prefix sum of small array', () => {
    const input = new Uint32Array([3, 1, 4, 1, 5]);
    const output = new Uint32Array(5);
    serialPrefixSum(input, output);
    expect(Array.from(output)).toEqual([0, 3, 4, 8, 9]);
  });

  it('handles all zeros', () => {
    const input = new Uint32Array([0, 0, 0, 0]);
    const output = new Uint32Array(4);
    serialPrefixSum(input, output);
    expect(Array.from(output)).toEqual([0, 0, 0, 0]);
  });

  it('handles single element', () => {
    const input = new Uint32Array([7]);
    const output = new Uint32Array(1);
    serialPrefixSum(input, output);
    expect(Array.from(output)).toEqual([0]);
  });

  it('handles 1024 elements (2 workgroups worth)', () => {
    const n = 1024;
    const input = new Uint32Array(n);
    for (let i = 0; i < n; i++) input[i] = i % 10;
    const output = new Uint32Array(n);
    serialPrefixSum(input, output);

    let running = 0;
    for (let i = 0; i < n; i++) {
      expect(output[i]).toBe(running);
      running += input[i];
    }
  });
});
