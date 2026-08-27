import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearToolExecutions,
  getToolExecutions,
  pushToolExecution,
} from '../toolExecutionTracker';

describe('toolExecutionTracker', () => {
  beforeEach(clearToolExecutions);

  it('mantiene solo las 200 entradas más recientes', () => {
    for (let i = 0; i < 201; i += 1) {
      pushToolExecution({
        toolName: 'tool-' + i,
        args: { i },
        success: true,
        error: null,
        timestamp: i,
        durationMs: i,
      });
    }

    expect(getToolExecutions()).toHaveLength(200);
    expect(getToolExecutions()[0].toolName).toBe('tool-1');
  });

  it('excluye mensajes del LLM sin mutar los args del caller', () => {
    const sentinel = 'SECRETO_LLM_TRACKER_27_AGOSTO';
    const args = { message: sentinel, awaiting: 'confirmation' };
    const record = {
      toolName: 'presentToUser',
      args,
      success: true,
      error: null,
      timestamp: 10,
      durationMs: 0,
    };

    pushToolExecution(record);

    // El canal verboso conserva su objeto; solo el ring mínimo se reduce.
    expect(record.args).toEqual({ message: sentinel, awaiting: 'confirmation' });
    args.awaiting = 'done';
    const stored = getToolExecutions()[0];
    expect(stored.args).toEqual({ awaiting: 'confirmation' });
    expect(stored.args).not.toHaveProperty('message');
    expect(JSON.stringify(stored)).not.toContain(sentinel);
  });

  it('conserva el message operativo de cualquier tool distinto a presentToUser', () => {
    const args = { message: 'mensaje operativo', other: 'metadata-1' };
    pushToolExecution({
      toolName: 'dynamicTool',
      args,
      success: true,
      error: null,
      timestamp: 20,
      durationMs: 3,
    });

    args.message = 'mutado por el caller';
    args.other = 'metadata-mutada';

    expect(getToolExecutions()[0].args).toEqual({
      message: 'mensaje operativo',
      other: 'metadata-1',
    });
  });
});
