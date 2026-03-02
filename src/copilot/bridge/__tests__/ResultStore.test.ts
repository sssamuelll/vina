import { describe, it, expect, vi } from 'vitest';
import { ResultStore } from '../ResultStore';
import type { StepResult } from '../types';

describe('ResultStore', () => {
  it('starts empty', () => {
    const store = new ResultStore();
    expect(store.getAll()).toEqual([]);
    expect(store.size).toBe(0);
  });

  it('adds and retrieves results', () => {
    const store = new ResultStore();
    const result: StepResult = {
      stepId: 'step1',
      success: true,
      data: { length: 314 },
    };
    store.add(result);
    expect(store.get('step1')).toEqual(result);
    expect(store.size).toBe(1);
  });

  it('returns undefined for unknown step', () => {
    const store = new ResultStore();
    expect(store.get('unknown')).toBeUndefined();
  });

  it('resolves variable references', () => {
    const store = new ResultStore();
    store.add({ stepId: 'step1', success: true, data: { length: 314 } });
    store.add({ stepId: 'step2', success: true, data: { width: 100 } });

    expect(store.resolve('$step1.result')).toEqual({ length: 314 });
    expect(store.resolve('$step2.result.width')).toBe(100);
    expect(store.resolve('literal')).toBe('literal');
  });

  it('resolves nested paths', () => {
    const store = new ResultStore();
    store.add({
      stepId: 'sim',
      success: true,
      data: { fitMap: { shoulder: { tension: 0.8 } } },
    });

    expect(store.resolve('$sim.result.fitMap.shoulder.tension')).toBe(0.8);
  });

  it('returns undefined for invalid reference', () => {
    const store = new ResultStore();
    store.add({ stepId: 'step1', success: true, data: { x: 1 } });
    expect(store.resolve('$step1.result.y')).toBeUndefined();
    expect(store.resolve('$unknown.result')).toBeUndefined();
  });

  it('tracks rollback functions', () => {
    const store = new ResultStore();
    const rollback1 = vi.fn();
    const rollback2 = vi.fn();

    store.add({ stepId: 's1', success: true, rollback: rollback1 });
    store.add({ stepId: 's2', success: true, rollback: rollback2 });
    store.add({ stepId: 's3', success: true }); // no rollback

    expect(store.hasRollbacks()).toBe(true);
  });

  it('rollbackAll calls rollbacks in reverse order', () => {
    const store = new ResultStore();
    const order: string[] = [];

    store.add({ stepId: 's1', success: true, rollback: () => order.push('s1') });
    store.add({ stepId: 's2', success: true, rollback: () => order.push('s2') });
    store.add({ stepId: 's3', success: true, rollback: () => order.push('s3') });

    store.rollbackAll();
    expect(order).toEqual(['s3', 's2', 's1']);
    expect(store.size).toBe(0);
  });

  it('clear removes all results', () => {
    const store = new ResultStore();
    store.add({ stepId: 's1', success: true });
    store.add({ stepId: 's2', success: true });
    store.clear();
    expect(store.size).toBe(0);
    expect(store.getAll()).toEqual([]);
  });

  it('getSuccessful returns only successful results', () => {
    const store = new ResultStore();
    store.add({ stepId: 's1', success: true, data: { a: 1 } });
    store.add({ stepId: 's2', success: false, error: 'fail' });
    store.add({ stepId: 's3', success: true, data: { b: 2 } });

    const successful = store.getSuccessful();
    expect(successful).toHaveLength(2);
    expect(successful.map(r => r.stepId)).toEqual(['s1', 's3']);
  });
});
