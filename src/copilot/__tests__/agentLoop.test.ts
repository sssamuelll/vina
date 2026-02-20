import { describe, it, expect } from 'vitest';
import type { ToolRound, AgentLoopResult } from '../agentLoop';

// We test the types and pure logic aspects of the agent loop.
// Full integration tests would require mocking LLM providers.

describe('AgentLoop types', () => {
  it('should define ToolRound correctly', () => {
    const round: ToolRound = {
      round: 1,
      toolCalls: [
        { name: 'createPiece', result: '{"pieceId":"p-1"}', success: true },
      ],
      text: 'Created a bodice front.',
    };
    expect(round.round).toBe(1);
    expect(round.toolCalls.length).toBe(1);
    expect(round.toolCalls[0].success).toBe(true);
  });

  it('should define AgentLoopResult correctly', () => {
    const result: AgentLoopResult = {
      content: 'Generated bodice block',
      rounds: [],
      language: 'es',
      teachingContent: ['Teaching about darts'],
      warnings: '',
      totalToolCalls: 2,
    };
    expect(result.language).toBe('es');
    expect(result.totalToolCalls).toBe(2);
    expect(result.rounds).toEqual([]);
  });
});
