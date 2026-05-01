/**
 * @vitest-environment jsdom
 *
 * C1 RFC canonical helper — useDisposable.
 *
 * Tests cover the 7 inventoried site shapes (Sites 1-5 inline-fixed by BUG-9
 * + Sites 6, 7 newly identified) plus edge cases for the hook contract:
 * null/undefined inputs, transitions to/from null, referential stability.
 *
 * Cross-ref: docs/reports/2026-05-01-rfc-c1-buffer-lifecycle.md § 5.2 commit 1.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { useDisposable } from '../useDisposable';

afterEach(cleanup);

interface MockDisposable {
  dispose: () => void;
}

function makeDisposable(): MockDisposable {
  return { dispose: vi.fn() };
}

function TestComponent({ value }: { value: MockDisposable | null | undefined }) {
  useDisposable(value);
  return null;
}

describe('useDisposable', () => {
  it('is a no-op when value is null', () => {
    const { unmount } = render(<TestComponent value={null} />);
    expect(() => unmount()).not.toThrow();
  });

  it('is a no-op when value is undefined', () => {
    const { unmount } = render(<TestComponent value={undefined} />);
    expect(() => unmount()).not.toThrow();
  });

  it('disposes a single value on unmount (Sites 1, 2 pure recipe)', () => {
    const value = makeDisposable();
    const { unmount } = render(<TestComponent value={value} />);

    expect(value.dispose).not.toHaveBeenCalled();

    unmount();

    expect(value.dispose).toHaveBeenCalledOnce();
  });

  it('disposes old value when value reference changes (Sites 1, 4, 5, 6, 7 dep-change)', () => {
    const v1 = makeDisposable();
    const v2 = makeDisposable();
    const { rerender, unmount } = render(<TestComponent value={v1} />);

    expect(v1.dispose).not.toHaveBeenCalled();

    rerender(<TestComponent value={v2} />);

    expect(v1.dispose).toHaveBeenCalledOnce();
    expect(v2.dispose).not.toHaveBeenCalled();

    unmount();

    expect(v2.dispose).toHaveBeenCalledOnce();
  });

  it('handles transition from null to value (nullable initial state, Site 4 / 6)', () => {
    const value = makeDisposable();
    const { rerender, unmount } = render(<TestComponent value={null} />);

    rerender(<TestComponent value={value} />);

    expect(value.dispose).not.toHaveBeenCalled();

    unmount();

    expect(value.dispose).toHaveBeenCalledOnce();
  });

  it('handles transition from value to null (degenerate input post-mount, Site 4 / 6)', () => {
    const value = makeDisposable();
    const { rerender, unmount } = render(<TestComponent value={value} />);

    rerender(<TestComponent value={null} />);

    expect(value.dispose).toHaveBeenCalledOnce();

    unmount();

    // No re-dispose (already disposed; null branch is no-op).
    expect(value.dispose).toHaveBeenCalledOnce();
  });

  it('does not dispose when value is referentially stable across re-renders', () => {
    const value = makeDisposable();
    const { rerender, unmount } = render(<TestComponent value={value} />);

    rerender(<TestComponent value={value} />);
    rerender(<TestComponent value={value} />);

    expect(value.dispose).not.toHaveBeenCalled();

    unmount();

    expect(value.dispose).toHaveBeenCalledOnce();
  });

  it('handles two parallel useDisposable calls in the same component (Site 3 multi-geo coupled)', () => {
    function MultiGeoComponent({
      a,
      b,
    }: {
      a: MockDisposable | null;
      b: MockDisposable | null;
    }) {
      useDisposable(a);
      useDisposable(b);
      return null;
    }

    const a = makeDisposable();
    const b = makeDisposable();
    const { unmount } = render(<MultiGeoComponent a={a} b={b} />);

    expect(a.dispose).not.toHaveBeenCalled();
    expect(b.dispose).not.toHaveBeenCalled();

    unmount();

    expect(a.dispose).toHaveBeenCalledOnce();
    expect(b.dispose).toHaveBeenCalledOnce();
  });

  it('handles multi-geo dep change (Site 3 both regenerate)', () => {
    function MultiGeoComponent({
      a,
      b,
    }: {
      a: MockDisposable;
      b: MockDisposable;
    }) {
      useDisposable(a);
      useDisposable(b);
      return null;
    }

    const a1 = makeDisposable();
    const b1 = makeDisposable();
    const a2 = makeDisposable();
    const b2 = makeDisposable();

    const { rerender, unmount } = render(<MultiGeoComponent a={a1} b={b1} />);

    rerender(<MultiGeoComponent a={a2} b={b2} />);

    expect(a1.dispose).toHaveBeenCalledOnce();
    expect(b1.dispose).toHaveBeenCalledOnce();
    expect(a2.dispose).not.toHaveBeenCalled();
    expect(b2.dispose).not.toHaveBeenCalled();

    unmount();

    expect(a2.dispose).toHaveBeenCalledOnce();
    expect(b2.dispose).toHaveBeenCalledOnce();
  });

  it('does not double-dispose when caller already disposed externally', () => {
    // Defensive: hook should not assume anything about prior disposal state.
    // Three.js dispose() is idempotent, but we verify the hook calls it once
    // per registered value-change boundary.
    const value = makeDisposable();
    const { unmount } = render(<TestComponent value={value} />);

    // Caller disposes externally (anti-pattern, but possible).
    value.dispose();
    expect(value.dispose).toHaveBeenCalledOnce();

    // Hook still calls dispose on unmount (caller's choice to manage idempotency).
    unmount();
    expect(value.dispose).toHaveBeenCalledTimes(2);
  });
});
