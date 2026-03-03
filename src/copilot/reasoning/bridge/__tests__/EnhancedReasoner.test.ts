// src/copilot/reasoning/bridge/__tests__/EnhancedReasoner.test.ts
import { describe, it, expect, vi } from 'vitest';
import { EnhancedReasoner } from '../EnhancedReasoner';
import type { ReasonerInput } from '../types';
import type { ProviderResponse, ProviderToolCall } from '../../../providers/types';
import type { MetaToolDefinition } from '../meta-tools/types';

const mockInput: ReasonerInput = {
  failedStep: { type: 'execute', id: 's1', tool: 'modifyEdge', params: { pieceId: 'bad-id' }, label: 'Modify' },
  error: 'Piece "bad-id" not found',
  resultsSoFar: [],
  originalIntent: 'reduce neckline 2cm',
};

const retryDecision = JSON.stringify({
  action: 'retry',
  newParams: { pieceId: 'front-bodice' },
  reason: 'Found correct piece via searchPieces',
});

const searchTool: MetaToolDefinition = {
  name: 'searchPieces',
  description: 'Search pieces',
  parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
  execute: vi.fn(async () => ({
    success: true,
    data: { matches: [{ pieceId: 'front-bodice', pieceName: 'Front Bodice', score: 0.9 }] },
  })),
};

function createMockSend(responses: ProviderResponse[]) {
  let callIndex = 0;
  return vi.fn(async () => {
    const response = responses[callIndex] ?? responses[responses.length - 1];
    callIndex++;
    return response;
  });
}

describe('EnhancedReasoner', () => {
  it('returns a decision without meta-tool calls', async () => {
    const send = createMockSend([
      { content: retryDecision, toolCalls: [] },
    ]);

    const reasoner = new EnhancedReasoner({
      send,
      metaTools: [],
      getState: () => ({}) as never,
    });

    const decision = await reasoner.analyze(mockInput);
    expect(decision.action).toBe('retry');
    expect(decision.newParams?.pieceId).toBe('front-bodice');
  });

  it('calls meta-tools to search for correct params', async () => {
    const toolCall: ProviderToolCall = {
      id: 'tc1',
      name: 'searchPieces',
      arguments: JSON.stringify({ query: 'front' }),
    };

    const send = createMockSend([
      { content: '', toolCalls: [toolCall] },
      { content: retryDecision, toolCalls: [] },
    ]);

    const reasoner = new EnhancedReasoner({
      send,
      metaTools: [searchTool],
      getState: () => ({}) as never,
    });

    const decision = await reasoner.analyze(mockInput);
    expect(decision.action).toBe('retry');
    expect(searchTool.execute).toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('returns abort on LLM error', async () => {
    const send = vi.fn(async () => { throw new Error('LLM failed'); });

    const reasoner = new EnhancedReasoner({
      send,
      metaTools: [],
      getState: () => ({}) as never,
    });

    const decision = await reasoner.analyze(mockInput);
    expect(decision.action).toBe('abort');
    expect(decision.reason).toContain('LLM failed');
  });
});
