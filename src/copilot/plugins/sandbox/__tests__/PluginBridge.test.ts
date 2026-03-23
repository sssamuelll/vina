import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import { PluginBridge } from '../PluginBridge';
import { EXECUTION_TIMEOUT_MS } from '../protocol';
import type { WorkerToMainMessage, CapabilityRequestMessage } from '../protocol';
import type { RootState } from '../../../../store';
import type { PatternPiece } from '../../../../types/types';

// ─── Worker Mock ────────────────────────────────────────────────────────────

/**
 * Minimal Worker mock.  The real Worker would run in a Web Worker context;
 * here we simulate message passing by calling `onmessage` manually.
 */
class MockWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  postMessage: Mock = vi.fn();
  terminate: Mock = vi.fn();

  /** Simulate a message arriving FROM the worker TO the main thread. */
  simulateMessage(data: WorkerToMainMessage): void {
    this.onmessage?.({ data } as MessageEvent<WorkerToMainMessage>);
  }

  /** Simulate a worker error event. */
  simulateError(message = 'Worker crashed'): void {
    this.onerror?.({ message } as ErrorEvent);
  }
}

// ─── State Helpers ──────────────────────────────────────────────────────────

function makePiece(id: string, overrides: Partial<PatternPiece> = {}): PatternPiece {
  return {
    id,
    name: `Piece ${id}`,
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 100] },
      { type: 'Z', values: [] },
    ],
    internals: [],
    position: { x: 0, y: 0 },
    rotation: 0,
    mirrored: false,
    seamAllowance: 10,
    active: true,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function makeState(pieces: PatternPiece[] = []): RootState {
  return {
    project: {
      pieces,
      avatar: {
        measurements: { chest: 96, waist: 82, hips: 96, height: 180 },
      },
    },
  } as unknown as RootState;
}

// ─── Bridge Factory ─────────────────────────────────────────────────────────

interface BridgeFixture {
  bridge: PluginBridge;
  worker: MockWorker;
  dispatch: Mock;
  getState: Mock;
}

function createBridgeFixture(options: {
  pieces?: PatternPiece[];
  permissions?: string[];
  allowlist?: string[];
} = {}): BridgeFixture {
  const worker = new MockWorker();
  const dispatch = vi.fn();
  const pieces = options.pieces ?? [];
  const getState = vi.fn(() => makeState(pieces));

  const bridge = new PluginBridge({
    worker: worker as unknown as Worker,
    pluginId: 'test.plugin',
    pluginName: 'Test Plugin',
    grantedPermissions: options.permissions ?? [],
    networkAllowlist: options.allowlist ?? [],
    dispatch,
    getState,
  });

  return { bridge, worker, dispatch, getState };
}

/** Simulate a capability request arriving from the worker. */
function sendCapabilityRequest(
  worker: MockWorker,
  requestId: string,
  method: string,
  args: unknown,
): void {
  const msg: CapabilityRequestMessage = {
    type: 'capability',
    requestId,
    method,
    args: args as unknown[],
  };
  worker.simulateMessage(msg);
}

/** Wait for a message of the given type and optional requestId to appear. */
function waitForPostMessage(
  worker: MockWorker,
  type: string,
  requestId?: string,
): Promise<Record<string, unknown>> {
  return vi.waitFor(() => {
    const call = worker.postMessage.mock.calls.find((c) => {
      const msg = c[0] as Record<string, unknown>;
      return msg.type === type && (requestId === undefined || msg.requestId === requestId);
    });
    if (!call) throw new Error(`No postMessage with type=${type} requestId=${requestId}`);
    return call[0] as Record<string, unknown>;
  });
}

/** Wait for an execute message and return the requestId. */
async function waitForExecute(worker: MockWorker): Promise<string> {
  const msg = await waitForPostMessage(worker, 'execute');
  return msg.requestId as string;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('PluginBridge', () => {
  // ─── readPieces ───────────────────────────────────────────────────────────

  describe('readPieces capability', () => {
    it('returns pieces when read-pieces permission is granted', async () => {
      const pieces = [makePiece('p1'), makePiece('p2')];
      const { bridge, worker } = createBridgeFixture({
        pieces,
        permissions: ['read-pieces'],
      });

      const execPromise = bridge.executeTool('myTool', {});
      const execRequestId = await waitForExecute(worker);

      const capRequestId = 'cap-read-pieces';
      sendCapabilityRequest(worker, capRequestId, 'readPieces', { limit: 50, offset: 0 });

      const result = await waitForPostMessage(worker, 'capabilityResult', capRequestId) as {
        requestId: string;
        data: { pieces: PatternPiece[]; total: number };
      };
      expect(result.data.pieces).toHaveLength(2);
      expect(result.data.total).toBe(2);

      worker.simulateMessage({ type: 'result', requestId: execRequestId, result: { success: true } });
      await execPromise;
      bridge.destroy();
    });

    it('denies readPieces and logs error when permission is not granted', async () => {
      const { bridge, worker, dispatch } = createBridgeFixture({ permissions: [] });

      const execPromise = bridge.executeTool('myTool', {});
      const execRequestId = await waitForExecute(worker);

      const capRequestId = 'cap-deny-read-pieces';
      sendCapabilityRequest(worker, capRequestId, 'readPieces', { limit: 10, offset: 0 });

      const denied = await waitForPostMessage(worker, 'capabilityDenied', capRequestId) as {
        permission: string;
        reason: string;
      };
      expect(denied.permission).toBe('read-pieces');

      // Should have dispatched a security error log
      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'plugins/setPluginError' }),
      );

      worker.simulateMessage({ type: 'result', requestId: execRequestId, result: { success: true } });
      await execPromise;
      bridge.destroy();
    });

    it('applies pagination correctly (offset + limit)', async () => {
      const pieces = [makePiece('p1'), makePiece('p2'), makePiece('p3'), makePiece('p4')];
      const { bridge, worker } = createBridgeFixture({
        pieces,
        permissions: ['read-pieces'],
      });

      const execPromise = bridge.executeTool('myTool', {});
      const execRequestId = await waitForExecute(worker);

      const capRequestId = 'cap-paginate';
      sendCapabilityRequest(worker, capRequestId, 'readPieces', { limit: 2, offset: 1 });

      const result = await waitForPostMessage(worker, 'capabilityResult', capRequestId) as {
        data: { pieces: PatternPiece[]; total: number };
      };
      expect(result.data.total).toBe(4);
      expect(result.data.pieces).toHaveLength(2);
      expect(result.data.pieces[0].id).toBe('p2');
      expect(result.data.pieces[1].id).toBe('p3');

      worker.simulateMessage({ type: 'result', requestId: execRequestId, result: { success: true } });
      await execPromise;
      bridge.destroy();
    });
  });

  // ─── updatePiece ──────────────────────────────────────────────────────────

  describe('updatePiece capability', () => {
    it('dispatches updatePiece when piece was previously read', async () => {
      const piece = makePiece('p1');
      const { bridge, worker, dispatch } = createBridgeFixture({
        pieces: [piece],
        permissions: ['read-pieces', 'write-pieces'],
      });

      const execPromise = bridge.executeTool('myTool', {});
      const execRequestId = await waitForExecute(worker);

      // Read first
      const readCapId = 'cap-read-before-update';
      sendCapabilityRequest(worker, readCapId, 'readPiece', { id: 'p1' });
      await waitForPostMessage(worker, 'capabilityResult', readCapId);

      // Now update
      const updateCapId = 'cap-update';
      const updatedPiece = { ...piece, name: 'Updated Front' };
      sendCapabilityRequest(worker, updateCapId, 'updatePiece', { piece: updatedPiece });
      await waitForPostMessage(worker, 'capabilityResult', updateCapId);

      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'project/updatePiece',
          payload: expect.objectContaining({ id: 'p1', name: 'Updated Front' }),
        }),
      );

      worker.simulateMessage({ type: 'result', requestId: execRequestId, result: { success: true } });
      await execPromise;
      bridge.destroy();
    });

    it('rejects updatePiece when piece was not previously read', async () => {
      const piece = makePiece('p1');
      const { bridge, worker } = createBridgeFixture({
        pieces: [piece],
        permissions: ['read-pieces', 'write-pieces'],
      });

      const execPromise = bridge.executeTool('myTool', {});
      const execRequestId = await waitForExecute(worker);

      // Attempt update without reading
      const capId = 'cap-update-no-read';
      sendCapabilityRequest(worker, capId, 'updatePiece', { piece });

      const denied = await waitForPostMessage(worker, 'capabilityDenied', capId) as { reason: string };
      expect(denied.reason).toMatch(/not previously read/i);

      worker.simulateMessage({ type: 'result', requestId: execRequestId, result: { success: true } });
      await execPromise;
      bridge.destroy();
    });

    it('validates outline — rejects if it does not start with M', async () => {
      const piece = makePiece('p1');
      const { bridge, worker } = createBridgeFixture({
        pieces: [piece],
        permissions: ['read-pieces', 'write-pieces'],
      });

      const execPromise = bridge.executeTool('myTool', {});
      const execRequestId = await waitForExecute(worker);

      const readCapId = 'cap-read-outline';
      sendCapabilityRequest(worker, readCapId, 'readPiece', { id: 'p1' });
      await waitForPostMessage(worker, 'capabilityResult', readCapId);

      const badPiece = {
        ...piece,
        outline: [{ type: 'L', values: [0, 0] }, { type: 'Z', values: [] }],
      };
      const capId = 'cap-bad-outline';
      sendCapabilityRequest(worker, capId, 'updatePiece', { piece: badPiece });

      const denied = await waitForPostMessage(worker, 'capabilityDenied', capId) as { reason: string };
      expect(denied.reason).toMatch(/M command/i);

      worker.simulateMessage({ type: 'result', requestId: execRequestId, result: { success: true } });
      await execPromise;
      bridge.destroy();
    });

    it('validates outline — rejects if it does not end with Z', async () => {
      const piece = makePiece('p1');
      const { bridge, worker } = createBridgeFixture({
        pieces: [piece],
        permissions: ['read-pieces', 'write-pieces'],
      });

      const execPromise = bridge.executeTool('myTool', {});
      const execRequestId = await waitForExecute(worker);

      const readCapId = 'cap-read-outline-z';
      sendCapabilityRequest(worker, readCapId, 'readPiece', { id: 'p1' });
      await waitForPostMessage(worker, 'capabilityResult', readCapId);

      const badPiece = {
        ...piece,
        outline: [{ type: 'M', values: [0, 0] }, { type: 'L', values: [100, 0] }],
      };
      const capId = 'cap-no-z';
      sendCapabilityRequest(worker, capId, 'updatePiece', { piece: badPiece });

      const denied = await waitForPostMessage(worker, 'capabilityDenied', capId) as { reason: string };
      expect(denied.reason).toMatch(/Z command/i);

      worker.simulateMessage({ type: 'result', requestId: execRequestId, result: { success: true } });
      await execPromise;
      bridge.destroy();
    });

    it('validates numeric ranges — rejects negative seamAllowance', async () => {
      const piece = makePiece('p1');
      const { bridge, worker } = createBridgeFixture({
        pieces: [piece],
        permissions: ['read-pieces', 'write-pieces'],
      });

      const execPromise = bridge.executeTool('myTool', {});
      const execRequestId = await waitForExecute(worker);

      const readCapId = 'cap-read-seam';
      sendCapabilityRequest(worker, readCapId, 'readPiece', { id: 'p1' });
      await waitForPostMessage(worker, 'capabilityResult', readCapId);

      const badPiece = { ...piece, seamAllowance: -5 };
      const capId = 'cap-bad-seam';
      sendCapabilityRequest(worker, capId, 'updatePiece', { piece: badPiece });

      const denied = await waitForPostMessage(worker, 'capabilityDenied', capId) as { reason: string };
      expect(denied.reason).toMatch(/seamAllowance/i);

      worker.simulateMessage({ type: 'result', requestId: execRequestId, result: { success: true } });
      await execPromise;
      bridge.destroy();
    });
  });

  // ─── fetch ────────────────────────────────────────────────────────────────

  describe('fetch capability', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('allows fetch when URL is in the allowlist and permission is granted', async () => {
      const mockResponse = {
        status: 200,
        blob: vi.fn().mockResolvedValue({ size: 100, text: vi.fn().mockResolvedValue('ok') }),
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

      const { bridge, worker } = createBridgeFixture({
        permissions: ['network'],
        allowlist: ['https://api.example.com/*'],
      });

      const execPromise = bridge.executeTool('myTool', {});
      const execRequestId = await waitForExecute(worker);

      const capId = 'cap-fetch-ok';
      sendCapabilityRequest(worker, capId, 'fetch', {
        url: 'https://api.example.com/data',
        options: {},
      });

      const result = await waitForPostMessage(worker, 'capabilityResult', capId) as {
        data: { status: number; body: string };
      };
      expect(result.data.status).toBe(200);
      expect(result.data.body).toBe('ok');

      worker.simulateMessage({ type: 'result', requestId: execRequestId, result: { success: true } });
      await execPromise;
      bridge.destroy();
    });

    it('denies fetch when URL is not in the allowlist', async () => {
      const { bridge, worker } = createBridgeFixture({
        permissions: ['network'],
        allowlist: ['https://api.example.com/*'],
      });

      const execPromise = bridge.executeTool('myTool', {});
      const execRequestId = await waitForExecute(worker);

      const capId = 'cap-fetch-blocked';
      sendCapabilityRequest(worker, capId, 'fetch', {
        url: 'https://evil.com/steal',
        options: {},
      });

      const denied = await waitForPostMessage(worker, 'capabilityDenied', capId) as { reason: string };
      expect(denied.reason).toMatch(/allowlist|not in/i);

      worker.simulateMessage({ type: 'result', requestId: execRequestId, result: { success: true } });
      await execPromise;
      bridge.destroy();
    });

    it('denies fetch when rate limit is exceeded', async () => {
      const mockResponse = {
        status: 200,
        blob: vi.fn().mockResolvedValue({ size: 5, text: vi.fn().mockResolvedValue('x') }),
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

      const { bridge, worker } = createBridgeFixture({
        permissions: ['network'],
        allowlist: ['https://api.example.com/*'],
      });

      const execPromise = bridge.executeTool('myTool', {});
      const execRequestId = await waitForExecute(worker);

      // Send 60 successful requests to exhaust the rate limit
      const LIMIT = 60;
      for (let i = 0; i < LIMIT; i++) {
        const capId = `cap-rate-${i}`;
        sendCapabilityRequest(worker, capId, 'fetch', {
          url: 'https://api.example.com/data',
          options: {},
        });
        await waitForPostMessage(worker, 'capabilityResult', capId); // sequential by design
      }

      // 61st should be rate-limited
      const limitCapId = 'cap-rate-exceeded';
      sendCapabilityRequest(worker, limitCapId, 'fetch', {
        url: 'https://api.example.com/data',
        options: {},
      });

      const denied = await waitForPostMessage(worker, 'capabilityDenied', limitCapId) as { reason: string };
      expect(denied.reason).toMatch(/rate limit/i);

      worker.simulateMessage({ type: 'result', requestId: execRequestId, result: { success: true } });
      await execPromise;
      bridge.destroy();
    });
  });

  // ─── storage ──────────────────────────────────────────────────────────────

  describe('getStorage / setStorage capability', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('prefixes the storage key with plugin:<pluginId>:', async () => {
      const storageMock: Record<string, string> = {};
      vi.stubGlobal('localStorage', {
        getItem: vi.fn((k: string) => storageMock[k] ?? null),
        setItem: vi.fn((k: string, v: string) => { storageMock[k] = v; }),
        removeItem: vi.fn((k: string) => { delete storageMock[k]; }),
        key: vi.fn((i: number) => Object.keys(storageMock)[i] ?? null),
        get length() { return Object.keys(storageMock).length; },
        clear: vi.fn(),
      });

      const { bridge, worker } = createBridgeFixture({ permissions: ['storage'] });

      const execPromise = bridge.executeTool('myTool', {});
      const execRequestId = await waitForExecute(worker);

      // setStorage
      const setCapId = 'cap-set-storage';
      sendCapabilityRequest(worker, setCapId, 'setStorage', { key: 'myKey', value: 'myValue' });
      await waitForPostMessage(worker, 'capabilityResult', setCapId);

      expect(storageMock['plugin:test.plugin:myKey']).toBe('myValue');

      // getStorage
      const getCapId = 'cap-get-storage';
      sendCapabilityRequest(worker, getCapId, 'getStorage', { key: 'myKey' });
      const result = await waitForPostMessage(worker, 'capabilityResult', getCapId) as {
        data: { value: string };
      };
      expect(result.data.value).toBe('myValue');

      worker.simulateMessage({ type: 'result', requestId: execRequestId, result: { success: true } });
      await execPromise;
      bridge.destroy();
    });

    it('getStorage returns null for a missing key', async () => {
      vi.stubGlobal('localStorage', {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        key: vi.fn(() => null),
        length: 0,
        clear: vi.fn(),
      });

      const { bridge, worker } = createBridgeFixture({ permissions: ['storage'] });

      const execPromise = bridge.executeTool('myTool', {});
      const execRequestId = await waitForExecute(worker);

      const capId = 'cap-get-missing';
      sendCapabilityRequest(worker, capId, 'getStorage', { key: 'no-such-key' });
      const result = await waitForPostMessage(worker, 'capabilityResult', capId) as {
        data: { value: string | null };
      };
      expect(result.data.value).toBeNull();

      worker.simulateMessage({ type: 'result', requestId: execRequestId, result: { success: true } });
      await execPromise;
      bridge.destroy();
    });
  });

  // ─── Execution timeout ────────────────────────────────────────────────────

  describe('execution timeout', () => {
    it('rejects executeTool after EXECUTION_TIMEOUT_MS', async () => {
      vi.useFakeTimers();

      const { bridge, worker } = createBridgeFixture();
      const execPromise = bridge.executeTool('myTool', {});

      await vi.waitFor(() =>
        worker.postMessage.mock.calls.some(
          (c) => (c[0] as Record<string, unknown>).type === 'execute',
        ),
      );

      vi.advanceTimersByTime(EXECUTION_TIMEOUT_MS + 1);

      await expect(execPromise).rejects.toThrow(/timed out/i);

      vi.useRealTimers();
      bridge.destroy();
    });
  });

  // ─── Crash handling ───────────────────────────────────────────────────────

  describe('crash handling', () => {
    it('rejects all pending executions when the worker crashes', async () => {
      const { bridge, worker, dispatch } = createBridgeFixture();

      const p1 = bridge.executeTool('tool1', {});
      const p2 = bridge.executeTool('tool2', {});

      // Ensure messages were enqueued
      await vi.waitFor(() => worker.postMessage.mock.calls.length >= 2);

      worker.simulateError('Out of memory');

      await expect(p1).rejects.toThrow(/crashed/i);
      await expect(p2).rejects.toThrow(/crashed/i);

      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'plugins/setPluginError' }),
      );

      bridge.destroy();
    });

    it('rolls back modified pieces when the worker crashes mid-execution', async () => {
      const piece = makePiece('p1');
      const { bridge, worker, dispatch } = createBridgeFixture({
        pieces: [piece],
        permissions: ['read-pieces', 'write-pieces'],
      });

      const execPromise = bridge.executeTool('myTool', {});
      await waitForExecute(worker);

      // Read then update
      const readCapId = 'cap-read-crash';
      sendCapabilityRequest(worker, readCapId, 'readPiece', { id: 'p1' });
      await waitForPostMessage(worker, 'capabilityResult', readCapId);

      const updateCapId = 'cap-update-crash';
      sendCapabilityRequest(worker, updateCapId, 'updatePiece', {
        piece: { ...piece, name: 'Modified' },
      });
      await waitForPostMessage(worker, 'capabilityResult', updateCapId);

      // Worker crashes
      worker.simulateError('Crash!');

      await expect(execPromise).rejects.toThrow(/crashed/i);

      // The original snapshot should be restored (last updatePiece call is the rollback)
      const updateCalls = dispatch.mock.calls.filter(
        (c) => (c[0] as Record<string, unknown>).type === 'project/updatePiece',
      );
      // First call: the actual update with 'Modified'; second call: rollback with original name
      const rollbackCall = updateCalls[updateCalls.length - 1]?.[0] as { payload: { name: string } } | undefined;
      expect(rollbackCall?.payload.name).toBe('Piece p1');

      bridge.destroy();
    });
  });

  // ─── destroy ──────────────────────────────────────────────────────────────

  describe('destroy()', () => {
    it('terminates the worker and rejects all pending executions', async () => {
      const { bridge, worker } = createBridgeFixture();

      const p1 = bridge.executeTool('myTool', {});
      bridge.destroy();

      await expect(p1).rejects.toThrow(/destroyed/i);
      expect(worker.terminate).toHaveBeenCalled();
    });

    it('is safe to call destroy() multiple times', () => {
      const { bridge } = createBridgeFixture();
      expect(() => {
        bridge.destroy();
        bridge.destroy();
      }).not.toThrow();
    });

    it('rejects executeTool after destroy', async () => {
      const { bridge } = createBridgeFixture();
      bridge.destroy();

      await expect(bridge.executeTool('anyTool', {})).rejects.toThrow(/destroyed/i);
    });
  });

  // ─── load promise ─────────────────────────────────────────────────────────

  describe('awaitLoad()', () => {
    it('resolves with tool schemas on loaded message', async () => {
      const { bridge, worker } = createBridgeFixture();

      const loadPromise = bridge.awaitLoad();
      const tools = [{ name: 'myTool', description: 'A tool', parameters: { type: 'object' as const, properties: {} }, requiredPermissions: [] }];
      worker.simulateMessage({ type: 'loaded', tools });

      const result = await loadPromise;
      expect(result).toEqual(tools);

      bridge.destroy();
    });

    it('rejects on loadError message', async () => {
      const { bridge, worker } = createBridgeFixture();

      const loadPromise = bridge.awaitLoad();
      worker.simulateMessage({ type: 'loadError', error: 'Syntax error in plugin' });

      await expect(loadPromise).rejects.toThrow('Syntax error in plugin');
      bridge.destroy();
    });
  });
});
