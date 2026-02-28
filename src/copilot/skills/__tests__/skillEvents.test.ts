/**
 * Tests for Skill Event Emitter.
 */
import { describe, it, expect, vi } from 'vitest';
import { SkillEventEmitter, type SkillEvent } from '../skillEvents';
import type { NSID } from '../nsid';

describe('SkillEventEmitter', () => {
  it('emits events to registered handlers', () => {
    const emitter = new SkillEventEmitter();
    const handler = vi.fn();

    emitter.on('skill:registered', handler);
    emitter.emit('skill:registered', 'openclo:bodice' as NSID);

    expect(handler).toHaveBeenCalledWith('openclo:bodice', undefined);
  });

  it('supports multiple handlers for same event', () => {
    const emitter = new SkillEventEmitter();
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    emitter.on('skill:registered', handler1);
    emitter.on('skill:registered', handler2);
    emitter.emit('skill:registered', 'openclo:bodice' as NSID);

    expect(handler1).toHaveBeenCalled();
    expect(handler2).toHaveBeenCalled();
  });

  it('returns unsubscribe function', () => {
    const emitter = new SkillEventEmitter();
    const handler = vi.fn();

    const unsubscribe = emitter.on('skill:registered', handler);
    unsubscribe();
    emitter.emit('skill:registered', 'openclo:bodice' as NSID);

    expect(handler).not.toHaveBeenCalled();
  });

  it('passes skill data to handlers', () => {
    const emitter = new SkillEventEmitter();
    const handler = vi.fn();
    const skillData = {
      nsid: 'openclo:bodice' as NSID,
      source: 'core' as const,
      version: '1.0.0',
      checksum: 'abc123',
      installedAt: Date.now(),
      updatedAt: Date.now(),
      enabled: true,
      skill: {
        name: 'bodice',
        triggers: ['bodice'],
        description: 'Test',
        methods: [{ name: 'Default', origin: 'US', description: 'D', formulas: {} }],
        formulas: {},
        easeTable: {},
        constructionSteps: [{ order: 1, instruction: 'Step', toolCalls: [] }],
      },
    };

    emitter.on('skill:registered', handler);
    emitter.emit('skill:registered', 'openclo:bodice' as NSID, skillData);

    expect(handler).toHaveBeenCalledWith('openclo:bodice', skillData);
  });

  it('handles all event types', () => {
    const emitter = new SkillEventEmitter();
    const events: SkillEvent[] = [
      'skill:registered',
      'skill:unregistered',
      'skill:enabled',
      'skill:disabled',
      'skill:updated',
    ];

    for (const event of events) {
      const handler = vi.fn();
      emitter.on(event, handler);
      emitter.emit(event, 'test:skill' as NSID);
      expect(handler).toHaveBeenCalled();
    }
  });

  it('isolates events - handler only receives subscribed event', () => {
    const emitter = new SkillEventEmitter();
    const registeredHandler = vi.fn();
    const unregisteredHandler = vi.fn();

    emitter.on('skill:registered', registeredHandler);
    emitter.on('skill:unregistered', unregisteredHandler);

    emitter.emit('skill:registered', 'test:skill' as NSID);

    expect(registeredHandler).toHaveBeenCalled();
    expect(unregisteredHandler).not.toHaveBeenCalled();
  });

  it('clear() removes all handlers for an event', () => {
    const emitter = new SkillEventEmitter();
    const handler = vi.fn();

    emitter.on('skill:registered', handler);
    emitter.clear('skill:registered');
    emitter.emit('skill:registered', 'test:skill' as NSID);

    expect(handler).not.toHaveBeenCalled();
  });

  it('clear() without argument removes all handlers', () => {
    const emitter = new SkillEventEmitter();
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    emitter.on('skill:registered', handler1);
    emitter.on('skill:unregistered', handler2);
    emitter.clear();

    emitter.emit('skill:registered', 'test:skill' as NSID);
    emitter.emit('skill:unregistered', 'test:skill' as NSID);

    expect(handler1).not.toHaveBeenCalled();
    expect(handler2).not.toHaveBeenCalled();
  });

  it('continues emitting even if handler throws', () => {
    const emitter = new SkillEventEmitter();
    const errorHandler = vi.fn(() => {
      throw new Error('Handler error');
    });
    const normalHandler = vi.fn();

    // Suppress console.error for this test
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    emitter.on('skill:registered', errorHandler);
    emitter.on('skill:registered', normalHandler);
    emitter.emit('skill:registered', 'test:skill' as NSID);

    expect(errorHandler).toHaveBeenCalled();
    expect(normalHandler).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});
