import { describe, it, expect } from 'vitest';
import { pathToSVG, HANDLE_RADIUS, ANCHOR_RADIUS } from '../components/PatternEditor/utils';
import { PathCommand } from '../types/types';

describe('pathToSVG', () => {
  it('converts M and L commands', () => {
    const cmds: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 100] },
      { type: 'Z', values: [] },
    ];
    expect(pathToSVG(cmds)).toBe('M0,0 L100,0 L100,100 Z');
  });

  it('converts cubic bezier', () => {
    const cmds: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'C', values: [10, 20, 30, 40, 50, 60] },
    ];
    expect(pathToSVG(cmds)).toBe('M0,0 C10,20,30,40,50,60');
  });

  it('handles empty array', () => {
    expect(pathToSVG([])).toBe('');
  });

  it('exports constants', () => {
    expect(HANDLE_RADIUS).toBe(4);
    expect(ANCHOR_RADIUS).toBe(4);
  });
});
