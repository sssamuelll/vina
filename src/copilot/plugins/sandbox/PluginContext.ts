/**
 * PluginContext — Worker-side async capability API.
 *
 * Each method sends a `capability` message to the main-thread bridge and
 * awaits the corresponding `capabilityResult` or `capabilityDenied` reply.
 *
 * @module plugins/sandbox/PluginContext
 */

import {
  CAPABILITY_TIMEOUT_MS,
  PermissionDeniedError,
  TimeoutError,
} from './protocol';
import type { CapabilityResultMessage, CapabilityDeniedMessage } from './protocol';

// ─── PluginContext ────────────────────────────────────────────────────────────

/**
 * Injected into every sandboxed plugin execution context so the plugin code
 * can call host capabilities (read pieces, fetch URLs, access storage, etc.)
 * without touching the DOM or Redux directly.
 */
export class PluginContext {
  private pendingRequests = new Map<
    string,
    {
      resolve: (data: unknown) => void;
      reject: (err: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  private postMessage: (msg: unknown) => void;

  constructor(postMessage: (msg: unknown) => void) {
    this.postMessage = postMessage;
  }

  // ─── Response handler ──────────────────────────────────────────────────────

  /**
   * Called by the Worker message handler when a `capabilityResult` or
   * `capabilityDenied` message arrives from the main thread.
   */
  handleResponse(msg: CapabilityResultMessage | CapabilityDeniedMessage): void {
    const pending = this.pendingRequests.get(msg.requestId);
    if (!pending) return;

    clearTimeout(pending.timer);
    this.pendingRequests.delete(msg.requestId);

    if (msg.type === 'capabilityResult') {
      pending.resolve(msg.data);
    } else {
      // capabilityDenied
      pending.reject(new PermissionDeniedError(msg.permission, msg.requestId));
    }
  }

  // ─── Capability API ────────────────────────────────────────────────────────

  /** Read a page of pattern pieces. */
  async readPieces(opts?: {
    ids?: string[];
    offset?: number;
    limit?: number;
  }): Promise<{ pieces: unknown[]; total: number }> {
    return this.request('readPieces', {
      limit: opts?.limit ?? 50,
      offset: opts?.offset ?? 0,
      ids: opts?.ids,
    }) as Promise<{ pieces: unknown[]; total: number }>;
  }

  /** Read a single pattern piece by ID. */
  async readPiece(id: string): Promise<unknown> {
    return this.request('readPiece', { id });
  }

  /** Persist changes to a pattern piece. */
  async updatePiece(piece: unknown): Promise<void> {
    await this.request('updatePiece', { piece });
  }

  /** Read the current body measurements. */
  async readMeasurements(): Promise<unknown> {
    return this.request('readMeasurements', {});
  }

  /** Perform an outbound network fetch through the host proxy. */
  async fetch(
    url: string,
    options?: unknown,
  ): Promise<{ status: number; body: string }> {
    return this.request('fetch', { url, options }) as Promise<{
      status: number;
      body: string;
    }>;
  }

  /** Read a persisted storage value for this plugin. */
  async getStorage(key: string): Promise<string | null> {
    const result = (await this.request('getStorage', { key })) as {
      value: string | null;
    };
    return result.value;
  }

  /** Write a persisted storage value for this plugin. */
  async setStorage(key: string, value: string): Promise<void> {
    await this.request('setStorage', { key, value });
  }

  /** Trigger a garment export in the given format. */
  async triggerExport(format: string, options?: unknown): Promise<void> {
    await this.request('triggerExport', { format, options });
  }

  /** Start, stop, or reset the cloth simulation. */
  async controlSimulation(action: 'start' | 'stop' | 'reset'): Promise<void> {
    await this.request('controlSimulation', { action });
  }

  // ─── Internals ─────────────────────────────────────────────────────────────

  /**
   * Send a capability request to the main thread and return a Promise that
   * resolves/rejects when the host replies or the timeout fires.
   */
  private request(method: string, args: unknown): Promise<unknown> {
    const requestId = crypto.randomUUID();

    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new TimeoutError(requestId, CAPABILITY_TIMEOUT_MS));
      }, CAPABILITY_TIMEOUT_MS);

      this.pendingRequests.set(requestId, { resolve, reject, timer });

      this.postMessage({
        type: 'capability',
        requestId,
        method,
        args,
      });
    });
  }

  /**
   * Reject all pending requests and clear internal state.
   * Must be called when the Worker is terminated or the plugin crashes.
   */
  destroy(): void {
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error('PluginContext destroyed'));
    }
    this.pendingRequests.clear();
  }
}
