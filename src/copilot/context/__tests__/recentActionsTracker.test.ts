/**
 * Tests for recentActionsTracker
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  trackAction,
  getRecentActions,
  getRecentSuccessfulActions,
  getRecentActionsByType,
  getActionsSince,
  clearActions,
  setMaxActions,
  subscribe,
  summarizeRecentActions,
  __resetForTesting,
} from '../recentActionsTracker';

describe('recentActionsTracker', () => {
  beforeEach(() => {
    __resetForTesting();
  });

  describe('trackAction', () => {
    it('should track a successful action', () => {
      trackAction('create_piece', 'Created Front Bodice', true, { pieceId: 'p1' });

      const actions = getRecentActions();
      expect(actions).toHaveLength(1);
      expect(actions[0].action).toBe('create_piece');
      expect(actions[0].result).toBe('Created Front Bodice');
      expect(actions[0].success).toBe(true);
      expect(actions[0].data).toEqual({ pieceId: 'p1' });
    });

    it('should track a failed action', () => {
      trackAction('delete_piece', 'Piece not found', false);

      const actions = getRecentActions();
      expect(actions).toHaveLength(1);
      expect(actions[0].success).toBe(false);
    });

    it('should add timestamp', () => {
      const before = Date.now();
      trackAction('test', 'Test action', true);
      const after = Date.now();

      const actions = getRecentActions();
      expect(actions[0].timestamp).toBeGreaterThanOrEqual(before);
      expect(actions[0].timestamp).toBeLessThanOrEqual(after);
    });

    it('should maintain order (newest last)', () => {
      trackAction('action1', 'First', true);
      trackAction('action2', 'Second', true);
      trackAction('action3', 'Third', true);

      const actions = getRecentActions();
      expect(actions[0].action).toBe('action1');
      expect(actions[2].action).toBe('action3');
    });
  });

  describe('getRecentActions', () => {
    it('should return all actions when no count specified', () => {
      trackAction('a1', 'r1', true);
      trackAction('a2', 'r2', true);
      trackAction('a3', 'r3', true);

      const actions = getRecentActions();
      expect(actions).toHaveLength(3);
    });

    it('should return limited actions when count specified', () => {
      trackAction('a1', 'r1', true);
      trackAction('a2', 'r2', true);
      trackAction('a3', 'r3', true);

      const actions = getRecentActions(2);
      expect(actions).toHaveLength(2);
      expect(actions[0].action).toBe('a2');
      expect(actions[1].action).toBe('a3');
    });

    it('should return copy, not reference', () => {
      trackAction('test', 'result', true);
      const actions1 = getRecentActions();
      const actions2 = getRecentActions();

      expect(actions1).not.toBe(actions2);
    });
  });

  describe('getRecentSuccessfulActions', () => {
    it('should filter to successful actions only', () => {
      trackAction('success1', 'ok', true);
      trackAction('fail1', 'error', false);
      trackAction('success2', 'ok', true);
      trackAction('fail2', 'error', false);

      const successful = getRecentSuccessfulActions();
      expect(successful).toHaveLength(2);
      expect(successful.every(a => a.success)).toBe(true);
    });

    it('should respect count limit', () => {
      trackAction('s1', 'ok', true);
      trackAction('s2', 'ok', true);
      trackAction('s3', 'ok', true);

      const successful = getRecentSuccessfulActions(2);
      expect(successful).toHaveLength(2);
    });
  });

  describe('getRecentActionsByType', () => {
    it('should filter by action type', () => {
      trackAction('create_piece', 'Created A', true);
      trackAction('select_piece', 'Selected A', true);
      trackAction('create_piece', 'Created B', true);
      trackAction('delete_piece', 'Deleted A', true);

      const creates = getRecentActionsByType('create_piece');
      expect(creates).toHaveLength(2);
      expect(creates.every(a => a.action === 'create_piece')).toBe(true);
    });
  });

  describe('getActionsSince', () => {
    it('should filter by timestamp', async () => {
      trackAction('old', 'old action', true);

      await new Promise(r => setTimeout(r, 50));
      const checkpoint = Date.now();
      await new Promise(r => setTimeout(r, 50));

      trackAction('new', 'new action', true);

      const recent = getActionsSince(checkpoint);
      expect(recent).toHaveLength(1);
      expect(recent[0].action).toBe('new');
    });
  });

  describe('clearActions', () => {
    it('should remove all actions', () => {
      trackAction('a1', 'r1', true);
      trackAction('a2', 'r2', true);

      expect(getRecentActions()).toHaveLength(2);

      clearActions();

      expect(getRecentActions()).toHaveLength(0);
    });
  });

  describe('setMaxActions', () => {
    it('should limit stored actions', () => {
      setMaxActions(3);

      trackAction('a1', 'r1', true);
      trackAction('a2', 'r2', true);
      trackAction('a3', 'r3', true);
      trackAction('a4', 'r4', true);
      trackAction('a5', 'r5', true);

      const actions = getRecentActions();
      expect(actions).toHaveLength(3);
      expect(actions[0].action).toBe('a3');
      expect(actions[2].action).toBe('a5');
    });

    it('should trim existing actions if reduced', () => {
      trackAction('a1', 'r1', true);
      trackAction('a2', 'r2', true);
      trackAction('a3', 'r3', true);
      trackAction('a4', 'r4', true);
      trackAction('a5', 'r5', true);

      setMaxActions(2);

      const actions = getRecentActions();
      expect(actions).toHaveLength(2);
    });
  });

  describe('subscribe', () => {
    it('should notify on action tracked', () => {
      const callback = vi.fn();
      const unsubscribe = subscribe(callback);

      trackAction('test', 'result', true);

      expect(callback).toHaveBeenCalledTimes(1);

      unsubscribe();
    });

    it('should notify on clear', () => {
      const callback = vi.fn();
      subscribe(callback);

      trackAction('test', 'result', true);
      clearActions();

      expect(callback).toHaveBeenCalledTimes(2);
    });

    it('should stop notifying after unsubscribe', () => {
      const callback = vi.fn();
      const unsubscribe = subscribe(callback);

      trackAction('test1', 'r1', true);
      unsubscribe();
      trackAction('test2', 'r2', true);

      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe('summarizeRecentActions', () => {
    it('should return "No recent actions" when empty', () => {
      const summary = summarizeRecentActions();
      expect(summary).toBe('No recent actions.');
    });

    it('should format actions as list', () => {
      trackAction('create_piece', 'Created Front Bodice', true);
      trackAction('select_piece', 'Selected piece', true);

      const summary = summarizeRecentActions();

      expect(summary).toContain('Recent actions:');
      expect(summary).toContain('✓ create_piece: Created Front Bodice');
      expect(summary).toContain('✓ select_piece: Selected piece');
    });

    it('should show failed actions with ✗', () => {
      trackAction('delete_piece', 'Piece not found', false);

      const summary = summarizeRecentActions();

      expect(summary).toContain('✗ delete_piece: Piece not found');
    });

    it('should respect count limit', () => {
      trackAction('a1', 'r1', true);
      trackAction('a2', 'r2', true);
      trackAction('a3', 'r3', true);
      trackAction('a4', 'r4', true);
      trackAction('a5', 'r5', true);

      const summary = summarizeRecentActions(2);
      const lines = summary.split('\n');

      // Header + 2 actions
      expect(lines).toHaveLength(3);
    });
  });
});
