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
    expect(record.turns).toHaveLength(0);
  });

  it('records error state', () => {
    recorder.start('test');
    const record = recorder.finalize('', false, 'Something broke');

    expect(record.success).toBe(false);
    expect(record.error).toBe('Something broke');
    expect(record.turns).toHaveLength(0);
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
    expect(record.turns).toHaveLength(0);
  });

  // ─── Turn tracking ──────────────────────────────────────────────────────────

  it('tracks a single turn with tool calls', () => {
    recorder.start('test request');

    recorder.startTurn(2);
    recorder.recordLLMResponse(
      '',
      undefined,
      [{ name: 'getGarmentState', arguments: {} }],
      { promptTokens: 100, completionTokens: 20, totalTokens: 120 },
      450,
    );
    recorder.recordTurnToolResult(
      'getGarmentState', {}, { success: true, pieces: ['front'] }, 5, true,
    );
    recorder.endTurn();

    const record = recorder.finalize('Done', true);

    expect(record.turns).toHaveLength(1);
    expect(record.turns[0].turnNumber).toBe(1);
    expect(record.turns[0].messageCount).toBe(2);
    expect(record.turns[0].llmDuration).toBe(450);
    expect(record.turns[0].toolCallsRequested).toHaveLength(1);
    expect(record.turns[0].toolResults).toHaveLength(1);
    expect(record.turns[0].toolResults[0].name).toBe('getGarmentState');
    expect(record.turns[0].usage?.promptTokens).toBe(100);
    // Also in flat list
    expect(record.toolCalls).toHaveLength(1);
    expect(record.toolCalls[0].name).toBe('getGarmentState');
  });

  it('tracks multiple turns with reasoning content', () => {
    recorder.start('reduce neckline');

    // Turn 1: read state
    recorder.startTurn(2);
    recorder.recordLLMResponse(
      '', undefined,
      [{ name: 'getGarmentState', arguments: {} }],
      undefined, 400,
    );
    recorder.recordTurnToolResult(
      'getGarmentState', {}, { pieces: ['front', 'back'] }, 3, true,
    );
    recorder.endTurn();

    // Turn 2: modify with reasoning
    recorder.startTurn(4);
    recorder.recordLLMResponse(
      '', 'I need to find the neckline edge on the front piece',
      [{ name: 'modifyEdge', arguments: { pieceId: 'front', delta: -20 } }],
      { promptTokens: 200, completionTokens: 40, totalTokens: 240 },
      380,
    );
    recorder.recordTurnToolResult(
      'modifyEdge', { pieceId: 'front', delta: -20 },
      { success: true }, 12, false,
    );
    recorder.endTurn();

    // Turn 3: final text response (no tools)
    recorder.startTurn(6);
    recorder.recordLLMResponse(
      'Neckline reduced by 2cm', undefined, [], undefined, 200,
    );
    recorder.endTurn();

    const record = recorder.finalize('Neckline reduced by 2cm', true);

    expect(record.turns).toHaveLength(3);
    expect(record.turns[0].turnNumber).toBe(1);
    expect(record.turns[1].turnNumber).toBe(2);
    expect(record.turns[1].reasoningContent).toBe(
      'I need to find the neckline edge on the front piece',
    );
    expect(record.turns[2].turnNumber).toBe(3);
    expect(record.turns[2].llmContent).toBe('Neckline reduced by 2cm');
    expect(record.turns[2].toolCallsRequested).toHaveLength(0);
    // Flat tool calls should have 2 entries
    expect(record.toolCalls).toHaveLength(2);
  });

  it('tracks tool errors within turns', () => {
    recorder.start('modify edge');

    recorder.startTurn(2);
    recorder.recordLLMResponse(
      '', undefined,
      [{ name: 'modifyEdge', arguments: { pieceId: 'bad' } }],
      undefined, 300,
    );
    recorder.recordTurnToolResult(
      'modifyEdge', { pieceId: 'bad' },
      { success: false, error: 'Piece not found' }, 8, false,
      'Piece not found',
    );
    recorder.endTurn();

    const record = recorder.finalize('', false, 'Tool failed');

    expect(record.turns[0].toolResults[0].error).toBe('Piece not found');
    expect(record.toolCalls[0].name).toBe('modifyEdge');
  });

  it('resets turns between runs', () => {
    recorder.start('first');
    recorder.startTurn(2);
    recorder.recordLLMResponse('', undefined, [], undefined, 100);
    recorder.endTurn();
    recorder.finalize('done', true);
    recorder.reset();

    recorder.start('second');
    const record = recorder.finalize('done', true);
    expect(record.turns).toHaveLength(0);
  });

  it('ignores turn-scoped records when no turn is active', () => {
    recorder.start('idle');
    recorder.recordLLMResponse('draft', undefined, [], undefined, 10);
    recorder.recordTurnToolResult('noop', {}, { ok: true }, 1, false, 'ignored');
    recorder.endTurn();

    const record = recorder.finalize('done', true);
    expect(record.turns).toHaveLength(0);
    expect(record.toolCalls).toHaveLength(1);
    expect(record.toolCalls[0].name).toBe('noop');
    expect(record.toolCalls[0]).not.toHaveProperty('error');
  });
});
