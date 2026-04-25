import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  recordStorageParseFailure,
  registerStorageParseFailureSink,
  getStorageParseFailureSnapshot,
  resetStorageParseFailureCounter,
  type StorageParseFailureEvent,
} from '../storageTelemetry';

describe('storageTelemetry', () => {
  beforeEach(() => {
    resetStorageParseFailureCounter();
  });

  describe('recordStorageParseFailure', () => {
    it('increments total + byKey + byReason on a single event', () => {
      recordStorageParseFailure({
        key: 'openclo-avatar-profiles',
        reason: 'json_parse',
        droppedCount: 1,
        keptCount: 0,
      });
      const snap = getStorageParseFailureSnapshot();
      expect(snap.total).toBe(1);
      expect(snap.byKey['openclo-avatar-profiles']).toBe(1);
      expect(snap.byReason.json_parse).toBe(1);
      expect(snap.byReason.schema_root).toBe(0);
      expect(snap.byReason.schema_record).toBe(0);
      expect(snap.byReason.storage_read).toBe(0);
    });

    it('groups counts by key across many events', () => {
      recordStorageParseFailure({ key: 'k1', reason: 'json_parse', droppedCount: 1, keptCount: 0 });
      recordStorageParseFailure({ key: 'k1', reason: 'schema_root', droppedCount: 1, keptCount: 0 });
      recordStorageParseFailure({ key: 'k2', reason: 'schema_record', droppedCount: 3, keptCount: 5 });
      const snap = getStorageParseFailureSnapshot();
      expect(snap.total).toBe(3);
      expect(snap.byKey).toEqual({ k1: 2, k2: 1 });
      expect(snap.byReason).toEqual({
        json_parse: 1,
        schema_root: 1,
        schema_record: 1,
        storage_read: 0,
      });
    });

    it('attaches a finite epoch timestamp', () => {
      const before = Date.now();
      recordStorageParseFailure({ key: 'k', reason: 'json_parse', droppedCount: 1, keptCount: 0 });
      const after = Date.now();
      const event = getStorageParseFailureSnapshot().recent[0];
      expect(event.timestamp).toBeGreaterThanOrEqual(before);
      expect(event.timestamp).toBeLessThanOrEqual(after);
    });

    it('preserves dropped/kept/detail in the recorded event', () => {
      recordStorageParseFailure({
        key: 'k',
        reason: 'schema_record',
        droppedCount: 7,
        keptCount: 12,
        detail: 'measurements.height — must be within [5, 500] cm',
      });
      const event = getStorageParseFailureSnapshot().recent[0];
      expect(event.droppedCount).toBe(7);
      expect(event.keptCount).toBe(12);
      expect(event.detail).toBe('measurements.height — must be within [5, 500] cm');
    });
  });

  describe('ring buffer', () => {
    it('caps recent at 50, dropping the oldest', () => {
      for (let i = 0; i < 60; i++) {
        recordStorageParseFailure({
          key: 'k',
          reason: 'json_parse',
          droppedCount: 1,
          keptCount: 0,
          detail: `event-${i}`,
        });
      }
      const snap = getStorageParseFailureSnapshot();
      expect(snap.total).toBe(60);
      expect(snap.recent.length).toBe(50);
      // First retained event should be the 11th one we recorded (event-10)
      expect(snap.recent[0].detail).toBe('event-10');
      expect(snap.recent[49].detail).toBe('event-59');
    });
  });

  describe('snapshot immutability', () => {
    it('returns a frozen snapshot whose mutations would throw in strict mode', () => {
      recordStorageParseFailure({ key: 'k', reason: 'json_parse', droppedCount: 1, keptCount: 0 });
      const snap = getStorageParseFailureSnapshot();
      expect(Object.isFrozen(snap)).toBe(true);
      expect(Object.isFrozen(snap.byKey)).toBe(true);
      expect(Object.isFrozen(snap.byReason)).toBe(true);
      expect(Object.isFrozen(snap.recent)).toBe(true);
    });

    it('does not leak internal state — mutating a snapshot does not affect future snapshots', () => {
      recordStorageParseFailure({ key: 'k', reason: 'json_parse', droppedCount: 1, keptCount: 0 });
      const snap = getStorageParseFailureSnapshot();
      // Mutating in non-strict mode is silently ignored on frozen objects;
      // the assertion is that subsequent snapshots are unaffected regardless.
      try {
        // @ts-expect-error intentional mutation attempt
        snap.byKey.k = 999;
      } catch {
        // strict mode throws; ignore
      }
      const snap2 = getStorageParseFailureSnapshot();
      expect(snap2.byKey.k).toBe(1);
    });
  });

  describe('sinks', () => {
    it('notifies a registered sink with the full event', () => {
      const sink = vi.fn();
      registerStorageParseFailureSink(sink);
      recordStorageParseFailure({
        key: 'k',
        reason: 'storage_read',
        droppedCount: 1,
        keptCount: 0,
      });
      expect(sink).toHaveBeenCalledTimes(1);
      const arg = sink.mock.calls[0][0] as StorageParseFailureEvent;
      expect(arg.key).toBe('k');
      expect(arg.reason).toBe('storage_read');
      expect(typeof arg.timestamp).toBe('number');
    });

    it('stops notifying after unregister', () => {
      const sink = vi.fn();
      const unregister = registerStorageParseFailureSink(sink);
      recordStorageParseFailure({ key: 'k', reason: 'json_parse', droppedCount: 1, keptCount: 0 });
      unregister();
      recordStorageParseFailure({ key: 'k', reason: 'json_parse', droppedCount: 1, keptCount: 0 });
      expect(sink).toHaveBeenCalledTimes(1);
    });

    it('swallows sink errors so the boundary path is never broken', () => {
      const bad = vi.fn(() => { throw new Error('sink boom'); });
      const good = vi.fn();
      registerStorageParseFailureSink(bad);
      registerStorageParseFailureSink(good);
      expect(() => {
        recordStorageParseFailure({ key: 'k', reason: 'json_parse', droppedCount: 1, keptCount: 0 });
      }).not.toThrow();
      expect(bad).toHaveBeenCalled();
      expect(good).toHaveBeenCalled();
      expect(getStorageParseFailureSnapshot().total).toBe(1);
    });
  });

  describe('reset', () => {
    it('clears counters and the ring buffer', () => {
      recordStorageParseFailure({ key: 'k1', reason: 'json_parse', droppedCount: 1, keptCount: 0 });
      recordStorageParseFailure({ key: 'k2', reason: 'schema_root', droppedCount: 1, keptCount: 0 });
      resetStorageParseFailureCounter();
      const snap = getStorageParseFailureSnapshot();
      expect(snap.total).toBe(0);
      expect(snap.byKey).toEqual({});
      expect(snap.byReason).toEqual({
        json_parse: 0,
        schema_root: 0,
        schema_record: 0,
        storage_read: 0,
      });
      expect(snap.recent).toEqual([]);
    });
  });
});
