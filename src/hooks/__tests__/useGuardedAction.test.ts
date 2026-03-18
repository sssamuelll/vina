import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveCallback, registerCallback, _resetCallbacksForTest } from '../useGuardedAction';

describe('useGuardedAction callback store', () => {
  beforeEach(() => {
    _resetCallbacksForTest();
  });

  it('registerCallback stores and returns a key', () => {
    const fn = vi.fn();
    const key = registerCallback(fn);
    expect(typeof key).toBe('string');
    expect(key.length).toBeGreaterThan(0);
  });

  it('resolveCallback retrieves and removes a stored callback', () => {
    const fn = vi.fn();
    const key = registerCallback(fn);
    const resolved = resolveCallback(key);
    expect(resolved).toBe(fn);
    expect(resolveCallback(key)).toBeUndefined();
  });

  it('resolveCallback returns undefined for unknown key', () => {
    expect(resolveCallback('nonexistent')).toBeUndefined();
  });

  it('multiple callbacks are independent', () => {
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    const key1 = registerCallback(fn1);
    const key2 = registerCallback(fn2);
    expect(resolveCallback(key1)).toBe(fn1);
    expect(resolveCallback(key2)).toBe(fn2);
  });

  it('_resetCallbacksForTest clears all callbacks', () => {
    const fn = vi.fn();
    const key = registerCallback(fn);
    _resetCallbacksForTest();
    expect(resolveCallback(key)).toBeUndefined();
  });

  it('resolveCallback on dismiss cleans up without executing', () => {
    const fn = vi.fn();
    const key = registerCallback(fn);
    // Simulate cancel/dismiss: resolve removes callback but caller discards it
    const cb = resolveCallback(key);
    expect(cb).toBe(fn);
    // Callback was removed — second resolve returns undefined
    expect(resolveCallback(key)).toBeUndefined();
    // The callback was NOT called (dismiss scenario — caller just doesn't invoke it)
    expect(fn).not.toHaveBeenCalled();
  });
});
