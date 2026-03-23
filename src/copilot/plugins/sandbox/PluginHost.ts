/**
 * PluginHost — Lifecycle manager for sandboxed plugins.
 *
 * Responsible for:
 * - Spawning a dedicated Worker per plugin via the shared worker.ts entry point.
 * - Creating a PluginBridge that owns the postMessage channel.
 * - Sending the `load` message and awaiting the `loaded` / `loadError` response.
 * - Registering each tool the plugin declares into the core ToolRegistry under
 *   the namespaced key `${pluginId}.${toolName}`.
 * - Tearing down the Worker and de-registering its tools on `unloadPlugin`.
 *
 * @module plugins/sandbox/PluginHost
 */

import type { AppDispatch, RootState } from '../../../store';
import type { ToolRegistry, ToolResult } from '../../action/tools/registry';
import type { PluginManifest } from '../types';
import type { LoadedMessage, ToolSchema } from './protocol';

// ─── PluginBridge interface ──────────────────────────────────────────────────

/**
 * Minimal interface that PluginHost requires from PluginBridge.
 *
 * The concrete PluginBridge class (Task 5) satisfies this interface.
 * Using an interface here keeps PluginHost decoupled from the concrete
 * implementation and makes unit-testing straightforward.
 */
export interface IPluginBridge {
  /**
   * Execute a named tool inside the sandboxed Worker.
   * @param toolName - Un-namespaced tool name (as declared by the plugin).
   * @param params   - Validated parameter bag.
   */
  executeTool(toolName: string, params: Record<string, unknown>): Promise<ToolResult>;

  /**
   * Terminate the Worker and clean up all pending requests.
   * After calling this, no further messages will be routed.
   */
  destroy(): void;
}

// ─── PluginBridge factory type ───────────────────────────────────────────────

/**
 * Signature of the factory function that creates a PluginBridge.
 *
 * The default implementation is `defaultBridgeFactory` at the bottom of this
 * file, which instantiates the real PluginBridge. Tests inject a mock factory
 * to avoid spawning actual Workers.
 *
 * `dispatch` and `getState` are included so that the production-grade
 * PluginBridge can fulfil capability requests (e.g. dispatching updatePiece)
 * without the factory needing to close over them externally.
 */
export type BridgeFactory = (
  worker: Worker,
  manifest: PluginManifest,
  dispatch: AppDispatch,
  getState: () => RootState,
) => IPluginBridge;

/**
 * Signature of the factory function that creates a Worker.
 *
 * The default implementation calls `new Worker(url, options)`.
 * Tests inject a mock factory to avoid spawning real Workers.
 */
export type WorkerFactory = (url: URL, options?: WorkerOptions) => Worker;

// ─── PluginEntry ─────────────────────────────────────────────────────────────

interface PluginEntry {
  worker: Worker;
  bridge: IPluginBridge;
  manifest: PluginManifest;
  /** Un-namespaced tool names registered for this plugin (for teardown). */
  toolNames: string[];
}

// ─── PluginHost ──────────────────────────────────────────────────────────────

/**
 * PluginHost manages the full lifecycle of sandboxed plugin Workers.
 *
 * @example
 * ```ts
 * const host = new PluginHost(store.dispatch, store.getState, registry);
 * await host.loadPlugin(manifest, pluginSourceCode);
 * // … the plugin's tools are now available in the registry …
 * await host.unloadPlugin(manifest.id);
 * ```
 */
export class PluginHost {
  private plugins = new Map<string, PluginEntry>();

  /**
   * @param dispatch       - Redux dispatch (forwarded to registered tool execute fns).
   * @param getState       - Redux getState (forwarded to registered tool execute fns).
   * @param registry       - Core ToolRegistry where plugin tools will be registered.
   * @param bridgeFactory  - Optional factory override; defaults to creating a real
   *                         PluginBridge backed by the plugin Worker.
   * @param workerFactory  - Optional factory for creating Workers; defaults to
   *                         `(url, opts) => new Worker(url, opts)`. Inject a mock
   *                         in tests to avoid spawning real Workers.
   */
  constructor(
    private readonly dispatch: AppDispatch,
    private readonly getState: () => RootState,
    private registry: ToolRegistry,
    private bridgeFactory: BridgeFactory = defaultBridgeFactory,
    private workerFactory: WorkerFactory = defaultWorkerFactory,
  ) {}

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * Load a plugin into a fresh sandboxed Worker and register its tools.
   *
   * 1. Creates a Worker from the shared worker.ts entry point.
   * 2. Wraps it in a PluginBridge for typed message routing.
   * 3. Sends the `load` message with the plugin source and API version.
   * 4. Awaits the `loaded` handshake (or rejects on `loadError`).
   * 5. Registers each declared tool in the core ToolRegistry.
   *
   * @param manifest    - Validated plugin manifest.
   * @param pluginCode  - ES module source code of the plugin.
   * @returns Promise that resolves when the plugin is ready.
   * @throws If the plugin fails to load or a tool name conflicts.
   */
  async loadPlugin(manifest: PluginManifest, pluginCode: string): Promise<void> {
    if (this.plugins.has(manifest.id)) {
      throw new Error(`Plugin "${manifest.id}" is already loaded`);
    }

    const apiVersion = this.resolveApiVersion(manifest);

    const worker = this.workerFactory(
      new URL('./worker.ts', import.meta.url),
      { type: 'module' },
    );

    const bridge = this.bridgeFactory(worker, manifest, this.dispatch, this.getState);

    // Register the listener BEFORE posting the `load` message to avoid a
    // race between sending and listening.
    const loadedPromise = this.waitForLoaded(worker, manifest.id);

    // Now send the load message — the listener is already attached above.
    worker.postMessage({
      type: 'load',
      pluginCode,
      manifest,
      apiVersion,
    });

    // Await the loaded / loadError handshake before touching the registry.
    const tools = await loadedPromise;

    const toolNames: string[] = [];

    for (const tool of tools) {
      const namespacedName = `${manifest.id}.${tool.name}`;

      this.registry.register({
        name: namespacedName,
        description: tool.description,
        parameters: tool.parameters,
        // The execute signature in ToolDefinition requires (params, dispatch, getState)
        // but plugin tools are sandboxed — they cannot receive Redux primitives
        // directly. We accept the arguments to satisfy the contract and proxy
        // the call through the bridge, which handles any Redux interactions on
        // the main thread via capability messages.
        execute: async (params: Record<string, unknown>) => {
          return bridge.executeTool(tool.name, params);
        },
      });

      toolNames.push(tool.name);
    }

    this.plugins.set(manifest.id, { worker, bridge, manifest, toolNames });
  }

  /**
   * Unload a plugin: terminate its Worker and de-register its tools.
   *
   * @param pluginId - The `id` from the plugin manifest.
   * @throws If the plugin is not currently loaded.
   */
  async unloadPlugin(pluginId: string): Promise<void> {
    const entry = this.plugins.get(pluginId);
    if (!entry) {
      throw new Error(`Plugin "${pluginId}" is not loaded`);
    }

    // Gracefully shut down the bridge (terminates the Worker internally).
    entry.bridge.destroy();

    // De-register all tools this plugin contributed.
    // ToolRegistry.register() throws on duplicates but has no unregister()
    // method on the public API; we access the private map via a cast.
    const registryAsAny = this.registry as unknown as {
      tools: Map<string, unknown>;
    };
    for (const toolName of entry.toolNames) {
      registryAsAny.tools.delete(`${pluginId}.${toolName}`);
    }

    this.plugins.delete(pluginId);
  }

  /**
   * Returns `true` when the plugin with the given id is currently loaded.
   */
  isLoaded(pluginId: string): boolean {
    return this.plugins.has(pluginId);
  }

  /**
   * Returns the ids of all currently loaded plugins.
   */
  getLoadedPluginIds(): string[] {
    return Array.from(this.plugins.keys());
  }

  // ─── Internals ─────────────────────────────────────────────────────────────

  /**
   * Derive the API version from the manifest.
   *
   * The manifest does not carry an `apiVersion` field directly — that is a
   * host concept communicated to the Worker on load. We default to `1` so that
   * plugins without an explicit version declaration still work.
   */
  private resolveApiVersion(manifest: PluginManifest): number {
    if (manifest.apiVersion != null) {
      return manifest.apiVersion;
    }
    console.warn(
      `[PluginHost] Plugin "${manifest.id}" has no apiVersion in manifest; ` +
        'defaulting to 1. Consider adding apiVersion to the manifest.',
    );
    return 1;
  }

  /**
   * Attach a one-shot message listener to the Worker and return a Promise that:
   * - Resolves with the list of `ToolSchema` when `loaded` arrives.
   * - Rejects with the error string when `loadError` arrives.
   *
   * The listener is registered BEFORE the caller sends the `load` message so
   * that no race between posting and listening is possible.
   *
   * @param worker   - The Worker to listen on.
   * @param pluginId - Used only for error messages.
   */
  private waitForLoaded(worker: Worker, pluginId: string): Promise<ToolSchema[]> {
    const LOAD_TIMEOUT_MS = 30_000;

    return new Promise<ToolSchema[]>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(
          `Plugin "${pluginId}" failed to load: timed out after ${LOAD_TIMEOUT_MS}ms waiting for 'loaded' message`,
        ));
      }, LOAD_TIMEOUT_MS);

      const onMessage = (event: MessageEvent): void => {
        const msg = event.data as { type: string };

        if (msg.type === 'loaded') {
          cleanup();
          resolve((msg as LoadedMessage).tools);
        } else if (msg.type === 'loadError') {
          cleanup();
          reject(
            new Error(
              `Plugin "${pluginId}" failed to load: ${(msg as { type: string; error: string }).error}`,
            ),
          );
        }
      };

      const onError = (event: ErrorEvent): void => {
        cleanup();
        reject(new Error(`Plugin "${pluginId}" Worker error: ${event.message}`));
      };

      const cleanup = (): void => {
        clearTimeout(timer);
        worker.removeEventListener('message', onMessage);
        worker.removeEventListener('error', onError);
      };

      worker.addEventListener('message', onMessage);
      worker.addEventListener('error', onError);
    });
  }
}

// ─── Default Worker Factory ──────────────────────────────────────────────────

/**
 * Default Worker factory — wraps `new Worker(url, options)` so that tests can
 * inject a mock without patching the global `Worker` constructor.
 */
export function defaultWorkerFactory(url: URL, options?: WorkerOptions): Worker {
  return new Worker(url, options);
}

// ─── Default Bridge Factory ──────────────────────────────────────────────────

/**
 * Default factory — creates a real PluginBridge using the concrete class.
 *
 * Accepts `dispatch` and `getState` so the bridge can fulfil capability
 * requests (e.g. reading pattern pieces, dispatching store actions) on the
 * main thread.
 */
export function defaultBridgeFactory(
  worker: Worker,
  manifest: PluginManifest,
  dispatch: AppDispatch,
  getState: () => RootState,
): IPluginBridge {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PluginBridge } = require('./PluginBridge') as typeof import('./PluginBridge');

  return new PluginBridge({
    worker,
    pluginId: manifest.id,
    pluginName: manifest.name,
    grantedPermissions: manifest.permissions,
    networkAllowlist: manifest.networkAllowlist ?? [],
    dispatch,
    getState,
  });
}
