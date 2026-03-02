import { describe, it, expect, beforeEach } from 'vitest';
import { executeToolCalls, formatExecutionSummary, LLMToolCall } from '../toolExecutor';
import { ToolRegistry, ToolDefinition, ToolResult } from '../action/tools/registry';
import type { AppDispatch, RootState } from '../../store';

function createTestTool(name: string, result: ToolResult): ToolDefinition {
  return {
    name,
    description: `Test: ${name}`,
    parameters: {
      type: 'object',
      properties: {
        input: { type: 'string' },
      },
      required: ['input'],
    },
    execute: async () => result,
  };
}

function createFailingTool(name: string): ToolDefinition {
  return {
    name,
    description: `Failing: ${name}`,
    parameters: {
      type: 'object',
      properties: {
        input: { type: 'string' },
      },
      required: ['input'],
    },
    execute: async () => {
      throw new Error('Tool execution failed');
    },
  };
}

const mockDispatch: AppDispatch = (() => {}) as unknown as AppDispatch;
const mockGetState: () => RootState = () => ({
  project: {
    id: 'test',
    name: 'Test',
    pieces: [],
    seams: [],
    fabrics: [],
    avatar: {
      id: 'default',
      name: 'Default',
      modelUrl: '',
      measurements: { height: 170, chest: 88, waist: 72, hips: 96, shoulder: 40, armLength: 60, inseam: 80 },
    },
    avatarMode: 'model',
    avatarModelUrl: null,
    isDirty: false,
  },
  editor: {
    viewMode: 'split',
    activeTool: 'select',
    selectedPieceIds: [],
    selectedSeamId: null,
    zoom2D: 1,
    pan2D: { x: 0, y: 0 },
    showSeamAllowance: true,
    showGrainlines: true,
    snapToGrid: true,
    gridSize: 10,
    units: 'mm',
  },
  simulation: {
    simulationState: 'idle',
    pieceFabrics: {},
    defaultFabricId: 'cotton-poplin',
  },
}) as unknown as RootState;

describe('executeToolCalls', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  it('should execute a single successful tool call', async () => {
    registry.register(createTestTool('myTool', { success: true, data: { id: '123' } }));

    const calls: LLMToolCall[] = [
      { id: 'call-1', name: 'myTool', arguments: { input: 'hello' } },
    ];

    const result = await executeToolCalls(calls, registry, mockDispatch, mockGetState);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.results[0].result.success).toBe(true);
  });

  it('should handle unknown tool', async () => {
    const calls: LLMToolCall[] = [
      { id: 'call-1', name: 'unknownTool', arguments: { input: 'test' } },
    ];

    const result = await executeToolCalls(calls, registry, mockDispatch, mockGetState);
    expect(result.failed).toBe(1);
    expect(result.results[0].result.error).toContain('Unknown tool');
  });

  it('should handle validation failure', async () => {
    registry.register(createTestTool('strictTool', { success: true }));

    const calls: LLMToolCall[] = [
      { id: 'call-1', name: 'strictTool', arguments: {} }, // missing required 'input'
    ];

    const result = await executeToolCalls(calls, registry, mockDispatch, mockGetState);
    expect(result.failed).toBe(1);
    expect(result.results[0].result.error).toContain('Invalid parameters');
  });

  it('should handle tool execution error', async () => {
    registry.register(createFailingTool('failTool'));

    const calls: LLMToolCall[] = [
      { id: 'call-1', name: 'failTool', arguments: { input: 'test' } },
    ];

    const result = await executeToolCalls(calls, registry, mockDispatch, mockGetState);
    expect(result.failed).toBe(1);
    expect(result.results[0].result.error).toContain('Execution error');
  });

  it('should execute multiple tools sequentially', async () => {
    const executionOrder: string[] = [];

    registry.register({
      name: 'first',
      description: 'First tool',
      parameters: { type: 'object', properties: { input: { type: 'string' } }, required: ['input'] },
      execute: async () => {
        executionOrder.push('first');
        return { success: true };
      },
    });

    registry.register({
      name: 'second',
      description: 'Second tool',
      parameters: { type: 'object', properties: { input: { type: 'string' } }, required: ['input'] },
      execute: async () => {
        executionOrder.push('second');
        return { success: true };
      },
    });

    const calls: LLMToolCall[] = [
      { id: 'call-1', name: 'first', arguments: { input: 'a' } },
      { id: 'call-2', name: 'second', arguments: { input: 'b' } },
    ];

    const result = await executeToolCalls(calls, registry, mockDispatch, mockGetState);
    expect(result.succeeded).toBe(2);
    expect(executionOrder).toEqual(['first', 'second']);
  });

  it('should continue after a failure', async () => {
    registry.register(createFailingTool('failTool'));
    registry.register(createTestTool('goodTool', { success: true }));

    const calls: LLMToolCall[] = [
      { id: 'call-1', name: 'failTool', arguments: { input: 'test' } },
      { id: 'call-2', name: 'goodTool', arguments: { input: 'test' } },
    ];

    const result = await executeToolCalls(calls, registry, mockDispatch, mockGetState);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.results.length).toBe(2);
  });
});

describe('formatExecutionSummary', () => {
  it('should format successful results', () => {
    const summary = formatExecutionSummary({
      results: [
        { toolCallId: '1', toolName: 'createPiece', result: { success: true, data: { id: '123' } } },
      ],
      succeeded: 1,
      failed: 0,
    });
    expect(summary).toContain('✅ createPiece');
    expect(summary).toContain('1 action applied');
  });

  it('should format failed results', () => {
    const summary = formatExecutionSummary({
      results: [
        { toolCallId: '1', toolName: 'deletePiece', result: { success: false, error: 'Not found' } },
      ],
      succeeded: 0,
      failed: 1,
    });
    expect(summary).toContain('❌ deletePiece');
    expect(summary).toContain('Not found');
    expect(summary).toContain('1 action failed');
  });

  it('should format mixed results', () => {
    const summary = formatExecutionSummary({
      results: [
        { toolCallId: '1', toolName: 'createPiece', result: { success: true } },
        { toolCallId: '2', toolName: 'deletePiece', result: { success: false, error: 'Not found' } },
      ],
      succeeded: 1,
      failed: 1,
    });
    expect(summary).toContain('✅ createPiece');
    expect(summary).toContain('❌ deletePiece');
  });
});
