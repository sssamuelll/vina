import { describe, it, expect } from 'vitest';
import { ExecutionRecorder } from '../ExecutionRecorder';
import type { MetaToolCallRecord } from '../types';

describe('ExecutionRecorder meta-tool tracking', () => {
  it('records meta-tool calls during planning', () => {
    const recorder = new ExecutionRecorder();
    recorder.start('test request');

    const metaToolCalls: MetaToolCallRecord[] = [
      { name: 'getGarmentState', arguments: {}, result: { pieces: [] }, duration: 50 },
      { name: 'getPieceDetails', arguments: { pieceId: 'p1' }, result: { edges: [] }, duration: 30 },
    ];
    recorder.recordPlanningMetaToolCalls(metaToolCalls);

    const record = recorder.finalize();
    expect(record.planning.metaToolCalls).toHaveLength(2);
    expect(record.planning.metaToolCalls![0].name).toBe('getGarmentState');
    expect(record.planning.metaToolCalls![1].duration).toBe(30);
  });
});
