import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgenticRecorder } from '../AgenticRecorder';

// Mock crypto.randomUUID
vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid' });

describe('AgenticRecorder', () => {
  let recorder: AgenticRecorder;

  beforeEach(() => {
    recorder = new AgenticRecorder();
  });

  it('records tool calls and finalizes', () => {
    recorder.start('reduce neckline 2cm');
    recorder.recordToolCall({
      name: 'getGarmentState',
      arguments: {},
      result: { success: true, data: { pieceCount: 2 } },
      duration: 5,
      isMetaTool: true,
    });
    recorder.recordToolCall({
      name: 'modifyEdge',
      arguments: { pieceId: 'p1', delta: -20 },
      result: { success: true, data: { newLength: 125 } },
      duration: 12,
      isMetaTool: false,
    });

    const record = recorder.finalize('Neckline reduced!', true);

    expect(record.id).toBe('test-uuid');
    expect(record.userRequest).toBe('reduce neckline 2cm');
    expect(record.toolCalls).toHaveLength(2);
    expect(record.toolCalls[0].isMetaTool).toBe(true);
    expect(record.toolCalls[1].isMetaTool).toBe(false);
    expect(record.finalResponse).toBe('Neckline reduced!');
    expect(record.success).toBe(true);
  });

  it('records error state', () => {
    recorder.start('test');
    const record = recorder.finalize('', false, 'Something broke');

    expect(record.success).toBe(false);
    expect(record.error).toBe('Something broke');
  });

  it('resets state between runs', () => {
    recorder.start('first');
    recorder.recordToolCall({
      name: 'test',
      arguments: {},
      result: {},
      duration: 0,
      isMetaTool: true,
    });
    recorder.finalize('done', true);
    recorder.reset();

    recorder.start('second');
    const record = recorder.finalize('done', true);

    expect(record.userRequest).toBe('second');
    expect(record.toolCalls).toHaveLength(0);
  });
});
