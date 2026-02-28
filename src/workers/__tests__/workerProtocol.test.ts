/**
 * Tests for Worker Protocol
 */
import { describe, it, expect } from 'vitest';
import {
  // Type guards
  isWorkerCommand,
  isWorkerResponse,
  // Command creators
  createBuildCommand,
  createCancelCommand,
  createWarmupCommand,
  createPingCommand,
  createTerminateCommand,
  // Response creators
  createResultResponse,
  createReadyResponse,
  createWarmedResponse,
  createPongResponse,
  createErrorResponse,
  // Constants
  WORKER_COMMANDS,
  WORKER_RESPONSES,
} from '../workerProtocol';
import type { BuildPieceJob, BuildPieceResult } from '../../types/reactiveSolver';

describe('Worker Protocol', () => {
  describe('WORKER_COMMANDS constants', () => {
    it('contains all expected command types', () => {
      expect(WORKER_COMMANDS.BUILD).toBe('BUILD');
      expect(WORKER_COMMANDS.CANCEL).toBe('CANCEL');
      expect(WORKER_COMMANDS.WARMUP).toBe('WARMUP');
      expect(WORKER_COMMANDS.PING).toBe('PING');
      expect(WORKER_COMMANDS.TERMINATE).toBe('TERMINATE');
    });
  });

  describe('WORKER_RESPONSES constants', () => {
    it('contains all expected response types', () => {
      expect(WORKER_RESPONSES.RESULT).toBe('RESULT');
      expect(WORKER_RESPONSES.READY).toBe('READY');
      expect(WORKER_RESPONSES.WARMED).toBe('WARMED');
      expect(WORKER_RESPONSES.PONG).toBe('PONG');
      expect(WORKER_RESPONSES.ERROR).toBe('ERROR');
    });
  });

  describe('isWorkerCommand', () => {
    it('returns true for valid commands', () => {
      expect(isWorkerCommand({ type: 'BUILD', job: {} })).toBe(true);
      expect(isWorkerCommand({ type: 'CANCEL', generationId: 1 })).toBe(true);
      expect(isWorkerCommand({ type: 'WARMUP' })).toBe(true);
      expect(isWorkerCommand({ type: 'PING' })).toBe(true);
      expect(isWorkerCommand({ type: 'TERMINATE' })).toBe(true);
    });

    it('returns false for invalid commands', () => {
      expect(isWorkerCommand(null)).toBe(false);
      expect(isWorkerCommand(undefined)).toBe(false);
      expect(isWorkerCommand({})).toBe(false);
      expect(isWorkerCommand({ type: 'UNKNOWN' })).toBe(false);
      expect(isWorkerCommand({ type: 123 })).toBe(false);
      expect(isWorkerCommand('BUILD')).toBe(false);
    });
  });

  describe('isWorkerResponse', () => {
    it('returns true for valid responses', () => {
      expect(isWorkerResponse({ type: 'RESULT', result: {} })).toBe(true);
      expect(isWorkerResponse({ type: 'READY' })).toBe(true);
      expect(isWorkerResponse({ type: 'WARMED' })).toBe(true);
      expect(isWorkerResponse({ type: 'PONG' })).toBe(true);
      expect(isWorkerResponse({ type: 'ERROR', error: 'test' })).toBe(true);
    });

    it('returns false for invalid responses', () => {
      expect(isWorkerResponse(null)).toBe(false);
      expect(isWorkerResponse(undefined)).toBe(false);
      expect(isWorkerResponse({})).toBe(false);
      expect(isWorkerResponse({ type: 'UNKNOWN' })).toBe(false);
      expect(isWorkerResponse({ type: 123 })).toBe(false);
    });
  });

  describe('Command Creators', () => {
    it('createBuildCommand creates valid BUILD command', () => {
      const job: BuildPieceJob = {
        jobId: 'job-1',
        generationId: 1,
        cPiece: {
          id: 'piece-1',
          name: 'Test',
          nodePointIds: ['p1', 'p2'],
          nodeCurveIds: [null, null],
          nodeConnections: ['line', 'line'],
          nodeReverse: [false, false],
          seamAllowance: 10,
          closed: true,
        },
        points: [],
        curves: [],
        existingPieceId: null,
      };

      const command = createBuildCommand(job);

      expect(command.type).toBe('BUILD');
      if (command.type === 'BUILD') {
        expect(command.job).toBe(job);
      }
    });

    it('createCancelCommand creates valid CANCEL command', () => {
      const command = createCancelCommand(42);

      expect(command.type).toBe('CANCEL');
      if (command.type === 'CANCEL') {
        expect(command.generationId).toBe(42);
      }
    });

    it('createWarmupCommand creates valid WARMUP command', () => {
      const command = createWarmupCommand();
      expect(command.type).toBe('WARMUP');
    });

    it('createPingCommand creates valid PING command', () => {
      const command = createPingCommand();
      expect(command.type).toBe('PING');
    });

    it('createTerminateCommand creates valid TERMINATE command', () => {
      const command = createTerminateCommand();
      expect(command.type).toBe('TERMINATE');
    });
  });

  describe('Response Creators', () => {
    it('createResultResponse creates valid RESULT response', () => {
      const result: BuildPieceResult = {
        jobId: 'job-1',
        generationId: 1,
        pieceId: 'piece-1',
        cPieceId: 'cpiece-1',
        outline: [{ type: 'M', values: [0, 0] }],
        position: { x: 50, y: 50 },
        success: true,
        metrics: {
          computeTimeMs: 10,
          pointCount: 4,
          curveCount: 0,
        },
      };

      const response = createResultResponse(result);

      expect(response.type).toBe('RESULT');
      if (response.type === 'RESULT') {
        expect(response.result).toBe(result);
      }
    });

    it('createReadyResponse creates valid READY response', () => {
      const response = createReadyResponse();
      expect(response.type).toBe('READY');
    });

    it('createWarmedResponse creates valid WARMED response', () => {
      const response = createWarmedResponse();
      expect(response.type).toBe('WARMED');
    });

    it('createPongResponse creates valid PONG response', () => {
      const response = createPongResponse();
      expect(response.type).toBe('PONG');
    });

    it('createErrorResponse creates valid ERROR response', () => {
      const response = createErrorResponse('Test error', 'job-1');

      expect(response.type).toBe('ERROR');
      if (response.type === 'ERROR') {
        expect(response.error).toBe('Test error');
        expect(response.jobId).toBe('job-1');
      }
    });

    it('createErrorResponse works without jobId', () => {
      const response = createErrorResponse('Test error');

      expect(response.type).toBe('ERROR');
      if (response.type === 'ERROR') {
        expect(response.error).toBe('Test error');
        expect(response.jobId).toBeUndefined();
      }
    });
  });

  describe('Re-exports from arrayBufferCodec', () => {
    it('re-exports serialization functions', async () => {
      const { serializePoint, serializePiece, deserializePiece } = await import('../workerProtocol');

      expect(typeof serializePoint).toBe('function');
      expect(typeof serializePiece).toBe('function');
      expect(typeof deserializePiece).toBe('function');
    });

    it('re-exports encoding functions', async () => {
      const { encodePoints, decodePoints, encodeOutline, decodeOutline } = await import('../workerProtocol');

      expect(typeof encodePoints).toBe('function');
      expect(typeof decodePoints).toBe('function');
      expect(typeof encodeOutline).toBe('function');
      expect(typeof decodeOutline).toBe('function');
    });

    it('re-exports capability detection', async () => {
      const { detectCapabilities, selectStrategy } = await import('../workerProtocol');

      expect(typeof detectCapabilities).toBe('function');
      expect(typeof selectStrategy).toBe('function');
    });
  });
});
