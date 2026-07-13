/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tools } from '../action/tools/definitions/memoryTools';
import * as memory from '../memory';
import { DesignLogManager } from '../perception/designLog';

/**
 * Security study #4: clearProjectMemory / clearDesignLog are NOT undoable
 * (no Ctrl+Z), yet the agent can invoke them. They must ask before wiping.
 */

const clearMem = tools.find((t) => t.name === 'clearProjectMemory')!;
const clearLog = tools.find((t) => t.name === 'clearDesignLog')!;
const getState = () => ({ project: { id: 'p1' } }) as never;
const noop = vi.fn();

describe('irreversible memory-clear tools require confirmation (#4)', () => {
  let confirmSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    confirmSpy = vi.spyOn(window, 'confirm');
  });
  afterEach(() => vi.restoreAllMocks());

  it('clearProjectMemory does NOT clear when the user cancels', async () => {
    confirmSpy.mockReturnValue(false);
    const clear = vi.spyOn(memory, 'clearLongTermMemory').mockResolvedValue(undefined as never);
    const res = (await clearMem.execute({}, noop, getState)) as { success: boolean };
    expect(confirmSpy).toHaveBeenCalledOnce();
    expect(clear).not.toHaveBeenCalled();
    expect(res.success).toBe(false);
  });

  it('clearProjectMemory clears when the user confirms', async () => {
    confirmSpy.mockReturnValue(true);
    const clear = vi.spyOn(memory, 'clearLongTermMemory').mockResolvedValue(undefined as never);
    const res = (await clearMem.execute({}, noop, getState)) as { success: boolean };
    expect(clear).toHaveBeenCalledWith('p1');
    expect(res.success).toBe(true);
  });

  it('clearDesignLog does NOT clear when the user cancels', async () => {
    confirmSpy.mockReturnValue(false);
    const clear = vi.spyOn(DesignLogManager, 'clear').mockImplementation(() => {});
    const res = (await clearLog.execute({}, noop, getState)) as { success: boolean };
    expect(clear).not.toHaveBeenCalled();
    expect(res.success).toBe(false);
  });

  it('clearDesignLog clears when the user confirms', async () => {
    confirmSpy.mockReturnValue(true);
    const clear = vi.spyOn(DesignLogManager, 'clear').mockImplementation(() => {});
    const res = (await clearLog.execute({}, noop, getState)) as { success: boolean };
    expect(clear).toHaveBeenCalledWith('p1');
    expect(res.success).toBe(true);
  });
});
