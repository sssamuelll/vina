import { describe, it, expect } from 'vitest';
import { SummaryGenerator } from '../SummaryGenerator';
import type { StepResult } from '../types';

describe('SummaryGenerator', () => {
  it('generates short summary from intent', () => {
    const generator = new SummaryGenerator();
    const results: StepResult[] = [
      { stepId: 's1', success: true, data: { oldValue: 314, newValue: 294 } },
    ];

    const summary = generator.generate('reduce_neckline', results);
    expect(summary.short).toContain('reduce_neckline');
  });

  it('generates details from measurement results', () => {
    const generator = new SummaryGenerator();
    const results: StepResult[] = [
      {
        stepId: 'measure_front',
        success: true,
        data: { pieceId: 'front', measurement: 314, unit: 'mm' },
      },
      {
        stepId: 'modify_front',
        success: true,
        data: { pieceId: 'front', oldValue: 314, newValue: 294, unit: 'mm' },
      },
      {
        stepId: 'modify_back',
        success: true,
        data: { pieceId: 'back', oldValue: 253, newValue: 233, unit: 'mm' },
      },
    ];

    const summary = generator.generate('reduce_neckline', results);
    expect(summary.details.length).toBeGreaterThan(0);
  });

  it('formats before/after values', () => {
    const generator = new SummaryGenerator();
    const results: StepResult[] = [
      {
        stepId: 's1',
        success: true,
        data: { pieceId: 'front', oldValue: 314, newValue: 294, unit: 'mm' },
      },
    ];

    const summary = generator.generate('modify', results);
    const detail = summary.details.find(d => d.includes('front'));
    expect(detail).toContain('314');
    expect(detail).toContain('294');
  });

  it('handles empty results', () => {
    const generator = new SummaryGenerator();
    const summary = generator.generate('test', []);
    expect(summary.short).toBeTruthy();
    expect(summary.details).toEqual([]);
  });

  it('includes step count and time', () => {
    const generator = new SummaryGenerator();
    const results: StepResult[] = [
      { stepId: 's1', success: true },
      { stepId: 's2', success: true },
      { stepId: 's3', success: true },
    ];

    const summary = generator.generate('test', results, 1234);
    expect(summary.details.some(d => d.includes('3'))).toBe(true);
    expect(summary.details.some(d => d.includes('1.2'))).toBe(true);
  });

  it('formats intent into readable text', () => {
    const generator = new SummaryGenerator();

    expect(generator.formatIntent('reduce_neckline')).toBe('Reduce neckline');
    expect(generator.formatIntent('add_seam_allowance')).toBe('Add seam allowance');
    expect(generator.formatIntent('measureEdge')).toBe('Measure edge');
  });
});
