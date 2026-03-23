/**
 * PluginBridge — Main-thread per-plugin message handler.
 *
 * Enforces permissions, validates mutations, handles timeouts and crashes,
 * and provides rollback for any pieces modified during an execution.
 *
 * @module plugins/sandbox/PluginBridge
 */

import type { AppDispatch, RootState } from '../../../store';
import type { ToolResult } from '../../action/tools/registry';
import { updatePiece } from '../../../store/projectSlice';
import { startSimulation, pauseSimulation, resetSimulation } from '../../../store/simulationSlice';
import { setPluginError } from '../../../store/pluginSlice';
import { checkPermissions } from '../pluginLoader';
import type { PluginPermission } from '../types';
import { NetworkValidator } from './networkValidator';
import {
  EXECUTION_TIMEOUT_MS,
  CAPABILITY_TIMEOUT_MS,
  FETCH_RATE_LIMIT_PER_MINUTE,
  MAX_PIECES_PER_REQUEST,
  MAX_FETCH_RESPONSE_BYTES,
  MAX_STORAGE_QUOTA_BYTES,
  MAX_STORAGE_VALUE_BYTES,
  PluginCrashError,
  TimeoutError,
  isWorkerToMainMessage,
} from './protocol';
import type {
  CapabilityRequestMessage,
  LoadedMessage,
  LoadErrorMessage,
  ResultMessage,
  ErrorMessage,
  ToolSchema,
} from './protocol';
import type { PatternPiece } from '../../../types/types';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Permission required for each capability method. */
const CAPABILITY_PERMISSIONS: Record<string, PluginPermission> = {
  readPieces: 'read-pieces',
  readPiece: 'read-pieces',
  updatePiece: 'write-pieces',
  readMeasurements: 'read-measurements',
  fetch: 'network',
  getStorage: 'storage',
  setStorage: 'storage',
  triggerExport: 'export',
  controlSimulation: 'simulation',
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PluginBridgeConfig {
  worker: Worker;
  pluginId: string;
  pluginName: string;
  grantedPermissions: string[];
  networkAllowlist: string[];
  dispatch: AppDispatch;
  getState: () => RootState;
}

/** State tracked per active tool execution. */
interface BridgeState {
  /** Piece IDs that have been read during this execution (ownership tracking). */
  readPieceIds: Set<string>;
  /** Piece IDs that have been modified during this execution (for rollback). */
  modifiedPieceIds: Set<string>;
  /** Snapshots of pieces before modification (for rollback). */
  pieceSnapshots: Map<string, PatternPiece>;
}

interface PendingExecution {
  resolve: (result: ToolResult) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  bridgeState: BridgeState;
}

// ─── PluginBridge ────────────────────────────────────────────────────────────

/**
 * Per-plugin bridge running on the main thread.
 *
 * Owns a single Worker, enforces all permission and validation rules,
 * and provides a clean `executeTool()` API for the plugin host.
 */
export class PluginBridge {
  private readonly worker: Worker;
  private readonly pluginId: string;
  private readonly pluginName: string;
  private readonly grantedPermissions: PluginPermission[];
  private readonly dispatch: AppDispatch;
  private readonly getState: () => RootState;
  private readonly networkValidator: NetworkValidator;

  /** Pending tool executions keyed by requestId. */
  private readonly pendingExecutions = new Map<string, PendingExecution>();

  /** Pending load promise handlers (resolved once on first loaded/loadError). */
  private loadResolve: ((tools: ToolSchema[]) => void) | null = null;
  private loadReject: ((err: Error) => void) | null = null;

  /** Whether the bridge has been destroyed. */
  private destroyed = false;

  constructor(config: PluginBridgeConfig) {
    this.worker = config.worker;
    this.pluginId = config.pluginId;
    this.pluginName = config.pluginName;
    this.grantedPermissions = config.grantedPermissions as PluginPermission[];
    this.dispatch = config.dispatch;
    this.getState = config.getState;
    this.networkValidator = new NetworkValidator(config.networkAllowlist);

    this.worker.onmessage = this.handleWorkerMessage.bind(this);
    this.worker.onerror = this.handleWorkerError.bind(this);
  }

  // ─── Load Promise ──────────────────────────────────────────────────────────

  /**
   * Returns a promise that resolves with the plugin's tool schemas once the
   * Worker sends a `loaded` message, or rejects on `loadError`.
   *
   * Should be awaited once after sending the `load` message.
   */
  awaitLoad(): Promise<ToolSchema[]> {
    return new Promise<ToolSchema[]>((resolve, reject) => {
      this.loadResolve = resolve;
      this.loadReject = reject;
    });
  }

  // ─── Tool Execution ────────────────────────────────────────────────────────

  /**
   * Request the sandboxed plugin to execute a tool.
   *
   * Returns a promise that resolves with the tool result, or rejects on
   * error or timeout (60 s).
   *
   * Tracks read and modified piece IDs for ownership checking and rollback.
   */
  executeTool(toolName: string, params: Record<string, unknown>): Promise<ToolResult> {
    if (this.destroyed) {
      return Promise.reject(new Error(`Plugin '${this.pluginId}' bridge is destroyed`));
    }

    const requestId = crypto.randomUUID();
    const bridgeState: BridgeState = {
      readPieceIds: new Set(),
      modifiedPieceIds: new Set(),
      pieceSnapshots: new Map(),
    };

    return new Promise<ToolResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        const pending = this.pendingExecutions.get(requestId);
        if (pending) {
          this.rollbackModifications(pending.bridgeState);
          this.pendingExecutions.delete(requestId);
        }
        reject(new TimeoutError(requestId, EXECUTION_TIMEOUT_MS));
      }, EXECUTION_TIMEOUT_MS);

      this.pendingExecutions.set(requestId, { resolve, reject, timer, bridgeState });

      this.worker.postMessage({
        type: 'execute',
        requestId,
        toolName,
        params,
      });
    });
  }

  // ─── Worker Message Routing ────────────────────────────────────────────────

  private handleWorkerMessage(event: MessageEvent): void {
    const msg = event.data;

    // Validate message structure at the trust boundary
    if (!isWorkerToMainMessage(msg)) {
      console.warn(
        `[PluginBridge:${this.pluginId}] Received unrecognized message from Worker:`,
        typeof msg === 'object' && msg !== null ? (msg as Record<string, unknown>).type : typeof msg,
      );
      return;
    }

    switch (msg.type) {
      case 'loaded':
        this.handleLoaded(msg);
        break;
      case 'loadError':
        this.handleLoadError(msg);
        break;
      case 'result':
        this.handleResult(msg);
        break;
      case 'error':
        this.handleError(msg);
        break;
      case 'capability':
        this.handleCapability(msg);
        break;
    }
  }

  private handleLoaded(msg: LoadedMessage): void {
    if (this.loadResolve) {
      this.loadResolve(msg.tools);
      this.loadResolve = null;
      this.loadReject = null;
    }
  }

  private handleLoadError(msg: LoadErrorMessage): void {
    if (this.loadReject) {
      this.loadReject(new Error(msg.error));
      this.loadResolve = null;
      this.loadReject = null;
    }
  }

  private handleResult(msg: ResultMessage): void {
    const pending = this.pendingExecutions.get(msg.requestId);
    if (!pending) {
      console.warn(`[PluginBridge:${this.pluginId}] Received 'result' for unknown requestId '${msg.requestId}' — likely timed out`);
      return;
    }

    clearTimeout(pending.timer);
    this.pendingExecutions.delete(msg.requestId);
    pending.resolve({
      success: msg.result.success,
      data: msg.result.data as Record<string, unknown> | undefined,
      error: msg.result.error,
    });
  }

  private handleError(msg: ErrorMessage): void {
    const pending = this.pendingExecutions.get(msg.requestId);
    if (!pending) {
      console.warn(`[PluginBridge:${this.pluginId}] Received 'error' for unknown requestId '${msg.requestId}' — likely timed out`);
      return;
    }

    clearTimeout(pending.timer);
    this.pendingExecutions.delete(msg.requestId);
    pending.reject(new Error(msg.error));
  }

  private handleWorkerError(event: ErrorEvent): void {
    const crashError = new PluginCrashError(
      this.pluginId,
      event.message ?? 'Unknown worker error',
    );

    // Log the crash via Redux
    this.dispatch(
      setPluginError({
        id: this.pluginId,
        error: crashError.message,
      }),
    );

    // Rollback any modifications from in-flight executions
    for (const pending of this.pendingExecutions.values()) {
      this.rollbackModifications(pending.bridgeState);
    }

    // Reject all pending executions
    for (const [, pending] of this.pendingExecutions) {
      clearTimeout(pending.timer);
      pending.reject(crashError);
    }
    this.pendingExecutions.clear();

    // Also reject a pending load if applicable
    if (this.loadReject) {
      this.loadReject(crashError);
      this.loadResolve = null;
      this.loadReject = null;
    }
  }

  // ─── Capability Dispatch ───────────────────────────────────────────────────

  private async handleCapability(msg: CapabilityRequestMessage): Promise<void> {
    const { requestId, method } = msg;

    // Find the in-flight execution that triggered this capability request.
    // Since capability requests arrive while an execution is in-flight, we
    // correlate them via a heuristic: use the most-recently-started execution.
    // This works because Worker executions are sequential (one at a time).
    const bridgeState = this.getCurrentBridgeState();

    // Permission check
    const requiredPermission = CAPABILITY_PERMISSIONS[method];
    if (requiredPermission) {
      const { allowed } = checkPermissions(
        this.grantedPermissions,
        [requiredPermission],
      );

      if (!allowed) {
        const reason = `Plugin '${this.pluginName}' does not have the '${requiredPermission}' permission`;
        this.dispatch(
          setPluginError({
            id: this.pluginId,
            error: `Security: capability '${method}' denied — missing permission '${requiredPermission}'`,
          }),
        );
        this.worker.postMessage({
          type: 'capabilityDenied',
          requestId,
          permission: requiredPermission,
          reason,
        });
        return;
      }
    }

    try {
      const args = msg.args;
      const data = await this.executeCapability(method, args, bridgeState);
      this.worker.postMessage({
        type: 'capabilityResult',
        requestId,
        data,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.worker.postMessage({
        type: 'capabilityDenied',
        requestId,
        permission: requiredPermission ?? method,
        reason: message,
      });
    }
  }

  /**
   * Get the BridgeState for the currently active execution.
   * Uses the most recently added pending execution (executions are sequential).
   */
  private getCurrentBridgeState(): BridgeState {
    // Return last-added pending execution's bridgeState, or a no-op state
    let last: BridgeState | undefined;
    for (const pending of this.pendingExecutions.values()) {
      last = pending.bridgeState;
    }
    return last ?? { readPieceIds: new Set(), modifiedPieceIds: new Set(), pieceSnapshots: new Map() };
  }

  // ─── Capability Handlers ───────────────────────────────────────────────────

  private async executeCapability(
    method: string,
    args: Record<string, unknown>,
    bridgeState: BridgeState,
  ): Promise<unknown> {
    switch (method) {
      case 'readPieces':
        return this.capReadPieces(args, bridgeState);
      case 'readPiece':
        return this.capReadPiece(args, bridgeState);
      case 'updatePiece':
        return this.capUpdatePiece(args, bridgeState);
      case 'readMeasurements':
        return this.capReadMeasurements();
      case 'fetch':
        return this.capFetch(args);
      case 'getStorage':
        return this.capGetStorage(args);
      case 'setStorage':
        return this.capSetStorage(args);
      case 'triggerExport':
        return this.capTriggerExport(args);
      case 'controlSimulation':
        return this.capControlSimulation(args);
      default:
        throw new Error(`Unknown capability: '${method}'`);
    }
  }

  // ─── readPieces ─────────────────────────────────────────────────────────────

  private capReadPieces(
    args: Record<string, unknown>,
    bridgeState: BridgeState,
  ): { pieces: PatternPiece[]; total: number } {
    const ids = args['ids'] as string[] | undefined;
    const offset = (args['offset'] as number | undefined) ?? 0;
    const limit = Math.min(
      (args['limit'] as number | undefined) ?? MAX_PIECES_PER_REQUEST,
      MAX_PIECES_PER_REQUEST,
    );

    const state = this.getState();
    let pieces: PatternPiece[] = state.project.pieces;

    if (ids && ids.length > 0) {
      pieces = pieces.filter((p) => ids.includes(p.id));
    }

    const total = pieces.length;
    const page = pieces.slice(offset, offset + limit);

    // Track which pieces were read
    for (const p of page) {
      bridgeState.readPieceIds.add(p.id);
    }

    return { pieces: page, total };
  }

  // ─── readPiece ──────────────────────────────────────────────────────────────

  private capReadPiece(
    args: Record<string, unknown>,
    bridgeState: BridgeState,
  ): PatternPiece {
    const id = args['id'] as string;
    const state = this.getState();
    const piece = state.project.pieces.find((p) => p.id === id);
    if (!piece) {
      throw new Error(`Piece '${id}' not found`);
    }
    bridgeState.readPieceIds.add(id);
    return piece;
  }

  // ─── updatePiece ────────────────────────────────────────────────────────────

  private capUpdatePiece(
    args: Record<string, unknown>,
    bridgeState: BridgeState,
  ): void {
    const piece = args['piece'] as PatternPiece;

    if (!piece || typeof piece !== 'object') {
      throw new Error('updatePiece: piece argument is required');
    }
    if (typeof piece.id !== 'string' || !piece.id) {
      throw new Error('updatePiece: piece must have a valid string id');
    }

    // Ownership check: must have been read in this execution
    if (!bridgeState.readPieceIds.has(piece.id)) {
      throw new Error(
        `updatePiece: piece '${piece.id}' was not previously read during this execution. ` +
        'Call readPiece() or readPieces() first.',
      );
    }

    // Existence check
    const state = this.getState();
    const existing = state.project.pieces.find((p) => p.id === piece.id);
    if (!existing) {
      throw new Error(`updatePiece: piece '${piece.id}' no longer exists`);
    }

    // Validate outline: must start with M and end with Z (if non-empty)
    if (piece.outline && piece.outline.length > 0) {
      const first = piece.outline[0];
      const last = piece.outline[piece.outline.length - 1];
      if (first.type !== 'M') {
        throw new Error('updatePiece: outline must start with an M command');
      }
      if (last.type !== 'Z') {
        throw new Error('updatePiece: outline must end with a Z command');
      }
    }

    // Validate numeric ranges
    if (piece.seamAllowance !== undefined) {
      if (typeof piece.seamAllowance !== 'number' || piece.seamAllowance < 0) {
        throw new Error('updatePiece: seamAllowance must be a non-negative number');
      }
    }
    if (piece.rotation !== undefined) {
      if (typeof piece.rotation !== 'number') {
        throw new Error('updatePiece: rotation must be a number');
      }
    }
    if (piece.solidifyFactor !== undefined) {
      if (
        typeof piece.solidifyFactor !== 'number' ||
        piece.solidifyFactor < 0 ||
        piece.solidifyFactor > 1
      ) {
        throw new Error('updatePiece: solidifyFactor must be a number between 0 and 1');
      }
    }

    // Take deep snapshot before first modification (for rollback)
    if (!bridgeState.pieceSnapshots.has(piece.id)) {
      bridgeState.pieceSnapshots.set(piece.id, structuredClone(existing));
    }

    bridgeState.modifiedPieceIds.add(piece.id);
    this.dispatch(updatePiece(piece));
  }

  // ─── readMeasurements ───────────────────────────────────────────────────────

  private capReadMeasurements(): Record<string, number> {
    const state = this.getState();
    return state.project.avatar.measurements as unknown as Record<string, number>;
  }

  // ─── fetch ──────────────────────────────────────────────────────────────────

  private async capFetch(args: Record<string, unknown>): Promise<{ status: number; body: string }> {
    const url = args['url'] as string;
    const rawOptions = (args['options'] as Record<string, unknown> | undefined) ?? {};

    if (!this.networkValidator.isUrlAllowed(url)) {
      throw new Error(`fetch: URL '${url}' is not in the allowlist or targets a private network`);
    }

    if (!this.networkValidator.checkRateLimit()) {
      throw new Error(`fetch: rate limit exceeded (max ${FETCH_RATE_LIMIT_PER_MINUTE} requests per minute)`);
    }

    // Sanitize RequestInit — only allow safe properties, force security defaults
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CAPABILITY_TIMEOUT_MS);
    const sanitizedOptions: RequestInit = {
      method: typeof rawOptions.method === 'string' ? rawOptions.method : 'GET',
      headers: rawOptions.headers as HeadersInit | undefined,
      body: rawOptions.body as BodyInit | undefined,
      // Security: force safe defaults — never send cookies, block redirects to private IPs
      credentials: 'omit',
      redirect: 'error',
      mode: 'cors',
      signal: controller.signal,
    };

    try {
      const response = await fetch(url, sanitizedOptions);

      // Cap response at 10 MB
      const blob = await response.blob();
      if (blob.size > MAX_FETCH_RESPONSE_BYTES) {
        throw new Error(
          `fetch: response body exceeds the ${MAX_FETCH_RESPONSE_BYTES / (1024 * 1024)} MiB limit`,
        );
      }

      const body = await blob.text();
      return { status: response.status, body };
    } finally {
      clearTimeout(timer);
    }
  }

  // ─── getStorage ─────────────────────────────────────────────────────────────

  private capGetStorage(args: Record<string, unknown>): { value: string | null } {
    const key = args['key'] as string;
    const storageKey = `plugin:${this.pluginId}:${key}`;
    try {
      const value = localStorage.getItem(storageKey);
      return { value };
    } catch (err) {
      console.error(`[PluginBridge:${this.pluginId}] localStorage.getItem failed for '${storageKey}':`, err);
      throw new Error(`getStorage: unable to read key '${key}' — localStorage may be unavailable`);
    }
  }

  // ─── setStorage ─────────────────────────────────────────────────────────────

  private capSetStorage(args: Record<string, unknown>): void {
    const key = args['key'] as string;
    const value = args['value'] as string;
    const storageKey = `plugin:${this.pluginId}:${key}`;

    if (typeof value !== 'string') {
      throw new Error('setStorage: value must be a string');
    }

    // Check single-value size limit
    const valueBytes = new TextEncoder().encode(value).length;
    if (valueBytes > MAX_STORAGE_VALUE_BYTES) {
      throw new Error(
        `setStorage: value exceeds the ${MAX_STORAGE_VALUE_BYTES / 1024} KiB per-key limit`,
      );
    }

    // Check total plugin quota
    const prefix = `plugin:${this.pluginId}:`;
    let totalBytes = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(prefix) && k !== storageKey) {
          const v = localStorage.getItem(k) ?? '';
          totalBytes += new TextEncoder().encode(v).length;
        }
      }
    } catch (err) {
      // Fail closed: if we can't verify quota, deny the write
      console.error(`[PluginBridge:${this.pluginId}] Cannot verify storage quota:`, err);
      throw new Error('setStorage: unable to verify storage quota — write denied. localStorage may be unavailable.');
    }

    if (totalBytes + valueBytes > MAX_STORAGE_QUOTA_BYTES) {
      throw new Error(
        `setStorage: plugin storage quota exceeded (max ${MAX_STORAGE_QUOTA_BYTES / 1024} KiB total)`,
      );
    }

    try {
      localStorage.setItem(storageKey, value);
    } catch (err) {
      throw new Error(`setStorage: failed to write key '${key}': ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ─── triggerExport ──────────────────────────────────────────────────────────

  private capTriggerExport(args: Record<string, unknown>): void {
    const format = args['format'] as string;
    // Dispatch a generic export intent action; the actual export UI/logic listens for this.
    // We dispatch an action that the export subsystem can intercept.
    this.dispatch({
      type: 'export/triggerExport',
      payload: { format, options: args['options'] ?? {} },
    });
  }

  // ─── controlSimulation ──────────────────────────────────────────────────────

  private capControlSimulation(args: Record<string, unknown>): void {
    const action = args['action'] as string;

    switch (action) {
      case 'start':
        this.dispatch(startSimulation());
        break;
      case 'stop':
        this.dispatch(pauseSimulation());
        break;
      case 'reset':
        // Reset goes through confirmation middleware for destructive protection
        this.dispatch(resetSimulation());
        break;
      default:
        throw new Error(`controlSimulation: unknown action '${action}'. Must be 'start', 'stop', or 'reset'`);
    }
  }

  // ─── Rollback ──────────────────────────────────────────────────────────────

  /**
   * Dispatch undo for any pieces modified during this execution.
   * Called when the Worker crashes mid-execution.
   */
  private rollbackModifications(bridgeState: BridgeState): void {
    let rollbackFailures = 0;
    for (const [pieceId, snapshot] of bridgeState.pieceSnapshots) {
      if (bridgeState.modifiedPieceIds.has(pieceId)) {
        try {
          this.dispatch(updatePiece(snapshot));
        } catch (err) {
          rollbackFailures++;
          console.error(
            `[PluginBridge:${this.pluginId}] Failed to rollback piece '${pieceId}':`, err,
          );
        }
      }
    }
    if (rollbackFailures > 0) {
      try {
        this.dispatch(setPluginError({
          id: this.pluginId,
          error: `Crash rollback partially failed: ${rollbackFailures} piece(s) could not be restored. Manual undo may be required.`,
        }));
      } catch {
        // Dispatch itself failed
      }
    }
  }

  // ─── Destroy ───────────────────────────────────────────────────────────────

  /**
   * Terminate the Worker and reject all pending executions.
   */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    this.worker.terminate();

    const destroyError = new Error(`Plugin '${this.pluginId}' bridge destroyed`);

    if (this.loadReject) {
      this.loadReject(destroyError);
      this.loadResolve = null;
      this.loadReject = null;
    }

    for (const [, pending] of this.pendingExecutions) {
      clearTimeout(pending.timer);
      pending.reject(destroyError);
    }
    this.pendingExecutions.clear();
  }
}
