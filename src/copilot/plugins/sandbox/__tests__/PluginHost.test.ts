/**
 * PluginHost unit tests.
 *
 * All Worker and PluginBridge interactions are fully mocked so the suite runs
 * in a Node / jsdom environment without spawning real Workers.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { PluginHost } from '../PluginHost';
import type { IPluginBridge, BridgeFactory, WorkerFactory } from '../PluginHost';
import { ToolRegistry } from '../../../action/tools/registry';
import type { PluginManifest } from '../../types';
import type { ToolResult } from '../../../action/tools/registry';

// ─── MockWorker ───────────────────────────────────────────────────────────────

/**
 * Minimal Worker stand-in that lets tests synchronously deliver messages as
 * if the real Worker had sent them.
 */
class MockWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;

  postMessage: Mock = vi.fn();
  terminate: Mock = vi.fn();

  private messageListeners: Array<(e: MessageEvent) => void> = [];
  private errorListeners: Array<(e: ErrorEvent) => void> = [];

  addEventListener(type: string, listener: (e: Event) => void): void {
    if (type === 'message') {
      this.messageListeners.push(listener as (e: MessageEvent) => void);
    } else if (type === 'error') {
      this.errorListeners.push(listener as (e: ErrorEvent) => void);
    }
  }

  removeEventListener(type: string, listener: (e: Event) => void): void {
    if (type === 'message') {
      this.messageListeners = this.messageListeners.filter((l) => l !== listener);
    } else if (type === 'error') {
      this.errorListeners = this.errorListeners.filter((l) => l !== listener);
    }
  }

  /** Simulate a message arriving from the Worker. */
  simulateMessage(data: unknown): void {
    const event = { data } as MessageEvent;
    this.messageListeners.forEach((l) => l(event));
    if (this.onmessage) this.onmessage(event);
  }

  /** Simulate an error event on the Worker. */
  simulateError(message: string): void {
    const event = { message } as ErrorEvent;
    this.errorListeners.forEach((l) => l(event));
    if (this.onerror) this.onerror(event);
  }
}

// ─── MockBridge ───────────────────────────────────────────────────────────────

function makeMockBridge(): IPluginBridge & {
  executeTool: Mock;
  destroy: Mock;
} {
  return {
    executeTool: vi.fn<(toolName: string, params: Record<string, unknown>) => Promise<ToolResult>>(),
    destroy: vi.fn(),
  };
}

// ─── Test fixtures ────────────────────────────────────────────────────────────

function makeManifest(overrides: Partial<PluginManifest> = {}): PluginManifest {
  return {
    id: 'com.test.plugin',
    name: 'Test Plugin',
    version: '1.0.0',
    author: 'Tester',
    description: 'A test plugin',
    license: 'MIT',
    compatibleWith: '>=1.0.0',
    entryPoint: 'index.js',
    permissions: [],
    ...overrides,
  };
}

/** Dummy Redux dispatch and getState. */
const mockDispatch = vi.fn();
const mockGetState = vi.fn();

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build a PluginHost wired to a single MockWorker and MockBridge.
 *
 * Returns the host, the worker mock, the bridge mock, and the registry so
 * tests can assert on all of them.
 */
function buildHost(workerMock?: MockWorker): {
  host: PluginHost;
  workerMock: MockWorker;
  bridgeMock: ReturnType<typeof makeMockBridge>;
  registry: ToolRegistry;
} {
  const worker = workerMock ?? new MockWorker();
  const bridgeMock = makeMockBridge();
  const registry = new ToolRegistry();

  // Inject a workerFactory that returns our MockWorker.
  const workerFactory: WorkerFactory = () => worker as unknown as Worker;
  const bridgeFactory: BridgeFactory = () => bridgeMock;

  const host = new PluginHost(
    mockDispatch as never,
    mockGetState as never,
    registry,
    bridgeFactory,
    workerFactory,
  );

  return { host, workerMock: worker, bridgeMock, registry };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PluginHost', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ─── loadPlugin — happy path ──────────────────────────────────────────────

  describe('loadPlugin()', () => {
    it('creates a Worker and sends a load message', async () => {
      const { host, workerMock } = buildHost();
      const manifest = makeManifest();

      // Simulate the Worker responding with `loaded` asynchronously.
      setImmediate(() => {
        workerMock.simulateMessage({ type: 'loaded', tools: [] });
      });

      await host.loadPlugin(manifest, 'export default { tools: [] }');

      expect(workerMock.postMessage).toHaveBeenCalledOnce();
      const msg = workerMock.postMessage.mock.calls[0][0] as Record<string, unknown>;
      expect(msg.type).toBe('load');
      expect(msg.pluginCode).toBe('export default { tools: [] }');
      expect(msg.manifest).toEqual(manifest);
      expect(msg.apiVersion).toBe(1);
    });

    it('resolves when the Worker sends loaded', async () => {
      const { host, workerMock } = buildHost();
      const manifest = makeManifest();

      setImmediate(() => {
        workerMock.simulateMessage({ type: 'loaded', tools: [] });
      });

      await expect(host.loadPlugin(manifest, '')).resolves.toBeUndefined();
    });

    it('rejects when the Worker sends loadError', async () => {
      const { host, workerMock } = buildHost();
      const manifest = makeManifest();

      setImmediate(() => {
        workerMock.simulateMessage({
          type: 'loadError',
          error: 'syntax error in plugin',
        });
      });

      await expect(host.loadPlugin(manifest, 'invalid code')).rejects.toThrow(
        'Plugin "com.test.plugin" failed to load: syntax error in plugin',
      );
    });

    it('rejects when the Worker emits an error event', async () => {
      const { host, workerMock } = buildHost();
      const manifest = makeManifest();

      setImmediate(() => {
        workerMock.simulateError('Worker crashed');
      });

      await expect(host.loadPlugin(manifest, '')).rejects.toThrow(
        'Plugin "com.test.plugin" Worker error: Worker crashed',
      );
    });

    it('registers tools in the registry with namespaced names', async () => {
      const { host, workerMock, registry } = buildHost();
      const manifest = makeManifest({ id: 'com.acme.grader' });

      const tools = [
        {
          name: 'gradeUp',
          description: 'Grade up a piece',
          parameters: { type: 'object' as const, properties: {} },
          requiredPermissions: [],
        },
        {
          name: 'gradeDown',
          description: 'Grade down a piece',
          parameters: { type: 'object' as const, properties: {} },
          requiredPermissions: [],
        },
      ];

      setImmediate(() => {
        workerMock.simulateMessage({ type: 'loaded', tools });
      });

      await host.loadPlugin(manifest, '');

      expect(registry.has('com.acme.grader.gradeUp')).toBe(true);
      expect(registry.has('com.acme.grader.gradeDown')).toBe(true);
    });

    it('throws if the same plugin is loaded twice', async () => {
      const { host, workerMock } = buildHost();
      const manifest = makeManifest();

      setImmediate(() => {
        workerMock.simulateMessage({ type: 'loaded', tools: [] });
      });

      await host.loadPlugin(manifest, '');

      // Second attempt should fail immediately before a new Worker is created.
      await expect(host.loadPlugin(manifest, '')).rejects.toThrow(
        'Plugin "com.test.plugin" is already loaded',
      );
    });

    it('logs a deprecation warning when apiVersion is missing', async () => {
      const { host, workerMock } = buildHost();
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const manifest = makeManifest();

      setImmediate(() => {
        workerMock.simulateMessage({ type: 'loaded', tools: [] });
      });

      await host.loadPlugin(manifest, '');

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('no apiVersion in manifest'),
      );
    });
  });

  // ─── unloadPlugin ─────────────────────────────────────────────────────────

  describe('unloadPlugin()', () => {
    it('calls bridge.destroy()', async () => {
      const { host, workerMock, bridgeMock } = buildHost();
      const manifest = makeManifest();

      setImmediate(() => {
        workerMock.simulateMessage({ type: 'loaded', tools: [] });
      });

      await host.loadPlugin(manifest, '');
      await host.unloadPlugin(manifest.id);

      expect(bridgeMock.destroy).toHaveBeenCalledOnce();
    });

    it('removes the plugin from the internal map', async () => {
      const { host, workerMock } = buildHost();
      const manifest = makeManifest();

      setImmediate(() => {
        workerMock.simulateMessage({ type: 'loaded', tools: [] });
      });

      await host.loadPlugin(manifest, '');
      expect(host.isLoaded(manifest.id)).toBe(true);

      await host.unloadPlugin(manifest.id);
      expect(host.isLoaded(manifest.id)).toBe(false);
    });

    it('de-registers tools from the registry', async () => {
      const { host, workerMock, registry } = buildHost();
      const manifest = makeManifest({ id: 'com.acme.cleanup' });

      const tools = [
        {
          name: 'myTool',
          description: 'Does something',
          parameters: { type: 'object' as const, properties: {} },
          requiredPermissions: [],
        },
      ];

      setImmediate(() => {
        workerMock.simulateMessage({ type: 'loaded', tools });
      });

      await host.loadPlugin(manifest, '');
      expect(registry.has('com.acme.cleanup.myTool')).toBe(true);

      await host.unloadPlugin(manifest.id);
      expect(registry.has('com.acme.cleanup.myTool')).toBe(false);
    });

    it('throws if the plugin is not loaded', async () => {
      const { host } = buildHost();

      await expect(host.unloadPlugin('non.existent.plugin')).rejects.toThrow(
        'Plugin "non.existent.plugin" is not loaded',
      );
    });
  });

  // ─── isLoaded ─────────────────────────────────────────────────────────────

  describe('isLoaded()', () => {
    it('returns false before the plugin is loaded', () => {
      const { host } = buildHost();
      expect(host.isLoaded('com.test.plugin')).toBe(false);
    });

    it('returns true after the plugin is loaded', async () => {
      const { host, workerMock } = buildHost();
      const manifest = makeManifest();

      setImmediate(() => {
        workerMock.simulateMessage({ type: 'loaded', tools: [] });
      });

      await host.loadPlugin(manifest, '');
      expect(host.isLoaded(manifest.id)).toBe(true);
    });

    it('returns false after the plugin is unloaded', async () => {
      const { host, workerMock } = buildHost();
      const manifest = makeManifest();

      setImmediate(() => {
        workerMock.simulateMessage({ type: 'loaded', tools: [] });
      });

      await host.loadPlugin(manifest, '');
      await host.unloadPlugin(manifest.id);
      expect(host.isLoaded(manifest.id)).toBe(false);
    });
  });

  // ─── getLoadedPluginIds ───────────────────────────────────────────────────

  describe('getLoadedPluginIds()', () => {
    it('returns an empty array when no plugins are loaded', () => {
      const { host } = buildHost();
      expect(host.getLoadedPluginIds()).toEqual([]);
    });

    it('returns ids of all loaded plugins', async () => {
      const registry = new ToolRegistry();
      const bridgeMock = makeMockBridge();

      // Two separate MockWorkers for two separate plugins.
      const worker1 = new MockWorker();
      const worker2 = new MockWorker();
      let callCount = 0;

      const workerFactory: WorkerFactory = () => {
        return (callCount++ === 0 ? worker1 : worker2) as unknown as Worker;
      };

      const host = new PluginHost(
        mockDispatch as never,
        mockGetState as never,
        registry,
        () => bridgeMock,
        workerFactory,
      );

      const manifest1 = makeManifest({ id: 'plugin.one' });
      const manifest2 = makeManifest({ id: 'plugin.two' });

      // Schedule both `loaded` responses.
      setImmediate(() => {
        worker1.simulateMessage({ type: 'loaded', tools: [] });
      });
      await host.loadPlugin(manifest1, '');

      setImmediate(() => {
        worker2.simulateMessage({ type: 'loaded', tools: [] });
      });
      await host.loadPlugin(manifest2, '');

      expect(host.getLoadedPluginIds()).toEqual(
        expect.arrayContaining(['plugin.one', 'plugin.two']),
      );
    });
  });

  // ─── Tool execution via registry ─────────────────────────────────────────

  describe('tool execution via registered tool', () => {
    it('routes registry.execute() to bridge.executeTool()', async () => {
      const { host, workerMock, bridgeMock, registry } = buildHost();
      const manifest = makeManifest({ id: 'com.acme.exec' });

      const tool = {
        name: 'doWork',
        description: 'Does work',
        parameters: { type: 'object' as const, properties: {} },
        requiredPermissions: [],
      };

      setImmediate(() => {
        workerMock.simulateMessage({ type: 'loaded', tools: [tool] });
      });

      await host.loadPlugin(manifest, '');

      const expectedResult: ToolResult = { success: true, data: { answer: 42 } };
      (bridgeMock.executeTool as Mock).mockResolvedValueOnce(expectedResult);

      // Provide context so registry.execute can call the registered function.
      registry.setContext(mockDispatch as never, mockGetState as never);

      const result = await registry.execute('com.acme.exec.doWork', {});

      expect(bridgeMock.executeTool).toHaveBeenCalledWith('doWork', {});
      expect(result).toEqual(expectedResult);
    });
  });
});
