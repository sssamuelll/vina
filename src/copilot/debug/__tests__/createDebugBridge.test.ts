/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgenticLoopOptions } from '../../reasoning/bridge/AgenticLoop';
import type { AgenticEvent } from '../../reasoning/bridge/AgenticLoop';
import type { AgenticRecord } from '../types';

const { debugStoreConstructorMock, savedRecords } = vi.hoisted(() => ({
  debugStoreConstructorMock: vi.fn(),
  savedRecords: [] as unknown[],
}));

vi.mock('../DebugStore', () => ({
  DebugStore: class {
    constructor() {
      debugStoreConstructorMock();
    }

    save(record: unknown) {
      savedRecords.push(record);
    }
  },
}));

import { createDebugAgenticLoop, isDebugEnabled } from '../createDebugBridge';
import { DEBUG_BRIDGE_STORAGE_KEY } from '../debugAPI';

const options = {
  send: vi.fn(),
  metaTools: [],
  actionToolDefs: [],
  getState: vi.fn(),
  dispatch: vi.fn(),
} as unknown as AgenticLoopOptions;

describe('gate del recorder verboso', () => {
  beforeEach(() => {
    localStorage.clear();
    savedRecords.length = 0;
    vi.clearAllMocks();
  });

  it('queda apagado por defecto y no construye DebugStore', () => {
    expect(isDebugEnabled()).toBe(false);
    expect(createDebugAgenticLoop(options).store).toBeNull();
    expect(debugStoreConstructorMock).not.toHaveBeenCalled();
  });

  it('solo se enciende con el string exacto true', () => {
    localStorage.setItem(DEBUG_BRIDGE_STORAGE_KEY, '1');
    expect(isDebugEnabled()).toBe(false);
    localStorage.setItem(DEBUG_BRIDGE_STORAGE_KEY, 'true');
    expect(isDebugEnabled()).toBe(true);
    expect(createDebugAgenticLoop(options).store).not.toBeNull();
    expect(debugStoreConstructorMock).toHaveBeenCalledTimes(1);
  });

  it('finaliza la corrida verbosa como fallida ante success false con error', async () => {
    localStorage.setItem(DEBUG_BRIDGE_STORAGE_KEY, 'true');
    const send = vi.fn()
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [{ id: 'tc-1', name: 'modifyEdge', arguments: '{}' }],
      })
      .mockResolvedValueOnce({ content: 'No se pudo modificar.', toolCalls: [] });
    const registry = {
      execute: vi.fn(async () => ({ success: false, error: 'Piece not found' })),
      get: vi.fn(() => ({ name: 'modifyEdge' })),
    };
    const { loop } = createDebugAgenticLoop({
      ...options,
      send,
      actionToolDefs: [{
        name: 'modifyEdge',
        description: 'Modifica un borde',
        parameters: { type: 'object', properties: {} },
      }],
      registry: registry as never,
    });
    const events: AgenticEvent[] = [];

    await loop.run('modifica el borde', (event) => events.push(event));

    expect(events).toContainEqual({
      type: 'tool:error',
      name: 'modifyEdge',
      error: 'Piece not found',
    });
    const record = savedRecords[0] as AgenticRecord;
    expect(record).toMatchObject({ success: false, error: 'Piece not found' });
    expect(record.turns.flatMap((turn) => turn.toolResults)).toContainEqual(
      expect.objectContaining({ name: 'modifyEdge', error: 'Piece not found' }),
    );
  });

  it('mantiene exitosa la corrida verbosa ante una cancelación neutral', async () => {
    localStorage.setItem(DEBUG_BRIDGE_STORAGE_KEY, 'true');
    const message = 'Cancelled — memory was not cleared.';
    const send = vi.fn()
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [{ id: 'tc-1', name: 'clearProjectMemory', arguments: '{}' }],
      })
      .mockResolvedValueOnce({ content: 'Cancelado.', toolCalls: [] });
    const registry = {
      execute: vi.fn(async () => ({ success: false, message })),
      get: vi.fn(() => ({ name: 'clearProjectMemory' })),
    };
    const { loop } = createDebugAgenticLoop({
      ...options,
      send,
      actionToolDefs: [{
        name: 'clearProjectMemory',
        description: 'Limpia la memoria',
        parameters: { type: 'object', properties: {} },
      }],
      registry: registry as never,
    });
    const events: AgenticEvent[] = [];

    await loop.run('limpia la memoria', (event) => events.push(event));

    expect(events).toContainEqual({
      type: 'tool:cancelled',
      name: 'clearProjectMemory',
      message,
    });
    const record = savedRecords[0] as AgenticRecord;
    expect(record.success).toBe(true);
    expect(record.error).toBeUndefined();
    expect(record.turns.flatMap((turn) => turn.toolResults)).toContainEqual(
      expect.objectContaining({ name: 'clearProjectMemory', error: undefined }),
    );
  });
});
