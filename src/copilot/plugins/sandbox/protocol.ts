/**
 * Plugin Sandbox Protocol — shared message types, type guards, error classes,
 * and constants for the postMessage channel between the main thread and the
 * sandboxed plugin Worker.
 *
 * @module plugins/sandbox/protocol
 */

import type { PluginManifest, PluginPermission } from '../types';
import type { ToolParametersSchema } from '../../action/tools/registry';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Maximum milliseconds to wait for a capability bridge response. */
export const CAPABILITY_TIMEOUT_MS = 30_000;

/** Maximum milliseconds to wait for a tool execution to complete. */
export const EXECUTION_TIMEOUT_MS = 60_000;

/** Maximum number of pattern pieces a plugin may request per API call. */
export const MAX_PIECES_PER_REQUEST = 50;

/** Maximum response body size for network capability fetch calls (10 MiB). */
export const MAX_FETCH_RESPONSE_BYTES = 10 * 1024 * 1024;

/** Maximum byte size of a single storage value. */
export const MAX_STORAGE_VALUE_BYTES = 100 * 1024;

/** Maximum total storage quota per plugin. */
export const MAX_STORAGE_QUOTA_BYTES = 1024 * 1024;

/** Maximum outbound fetch requests per minute per plugin. */
export const FETCH_RATE_LIMIT_PER_MINUTE = 60;

// ─── Tool Schema ─────────────────────────────────────────────────────────────

/**
 * Describes a single tool exposed by a plugin inside the sandbox.
 * Sent from the Worker to the main thread during the `loaded` handshake.
 */
export interface ToolSchema {
  /** Tool name (un-namespaced; the registry will prefix with pluginId). */
  name: string;
  /** Human-readable description for the LLM. */
  description: string;
  /** JSON Schema describing the tool's parameters. */
  parameters: ToolParametersSchema;
  /** Permissions the tool requires at runtime. */
  requiredPermissions: PluginPermission[];
}

// ─── Main → Worker Messages ──────────────────────────────────────────────────

/**
 * Sent once to initialise the sandbox: delivers the plugin source code,
 * its manifest, and the host's current API version.
 */
export interface LoadMessage {
  type: 'load';
  /** ES module source code of the plugin (already fetched & validated). */
  pluginCode: string;
  /** Parsed and validated plugin manifest. */
  manifest: PluginManifest;
  /** Host API version integer for forward-compatibility checks. */
  apiVersion: number;
}

/**
 * Requests the sandbox to invoke a specific tool with the given params.
 */
export interface ExecuteMessage {
  type: 'execute';
  /** Unique request identifier; echoed back in the result. */
  requestId: string;
  /** Tool name as registered by the plugin (un-namespaced). */
  toolName: string;
  /** Validated parameter bag for the tool invocation. */
  params: Record<string, unknown>;
}

/**
 * Delivers the result of a capability request back into the sandbox.
 * Sent after the main thread has fulfilled a `CapabilityRequestMessage`.
 */
export interface CapabilityResultMessage {
  type: 'capabilityResult';
  /** Matches the `requestId` of the originating CapabilityRequestMessage. */
  requestId: string;
  /** Arbitrary data returned by the capability handler. */
  data: unknown;
}

/**
 * Informs the sandbox that a capability request was denied by the
 * permission gate or policy enforcement.
 */
export interface CapabilityDeniedMessage {
  type: 'capabilityDenied';
  /** Matches the `requestId` of the originating CapabilityRequestMessage. */
  requestId: string;
  /** The permission that was missing or denied. */
  permission: string;
  /** Human-readable explanation of why the request was denied. */
  reason: string;
}

/**
 * Instructs the sandbox Worker to shut down gracefully.
 */
export interface TerminateMessage {
  type: 'terminate';
}

/** Union of all messages the main thread sends to the Worker. */
export type MainToWorkerMessage =
  | LoadMessage
  | ExecuteMessage
  | CapabilityResultMessage
  | CapabilityDeniedMessage
  | TerminateMessage;

// ─── Worker → Main Messages ──────────────────────────────────────────────────

/**
 * Sent after the plugin has been successfully loaded and registered its tools.
 */
export interface LoadedMessage {
  type: 'loaded';
  /** All tools the plugin exposes; the host will register them. */
  tools: ToolSchema[];
}

/**
 * Sent when loading the plugin fails for any reason.
 */
export interface LoadErrorMessage {
  type: 'loadError';
  /** Human-readable error description. */
  error: string;
}

/**
 * Delivers the outcome of a tool execution back to the main thread.
 */
export interface ResultMessage {
  type: 'result';
  /** Matches the `requestId` of the originating ExecuteMessage. */
  requestId: string;
  /** Execution result envelope. */
  result: {
    success: boolean;
    data?: unknown;
    error?: string;
  };
}

/**
 * Sent when an unexpected error occurs inside the sandbox during execution
 * (distinct from a graceful tool-level failure captured in ResultMessage).
 */
export interface ErrorMessage {
  type: 'error';
  /** Matches the `requestId` of the originating ExecuteMessage, if applicable. */
  requestId: string;
  /** Error description. */
  error: string;
}

/**
 * Sent by the sandbox when the plugin code calls a capability API method.
 * The main thread resolves the request and replies with `CapabilityResultMessage`
 * or `CapabilityDeniedMessage`.
 */
export interface CapabilityRequestMessage {
  type: 'capability';
  /** Unique identifier for correlating the reply. */
  requestId: string;
  /** Capability method being invoked (e.g. `'getPieces'`, `'fetch'`). */
  method: string;
  /** Arguments passed to the capability method. */
  args: unknown[];
}

/** Union of all messages the Worker sends to the main thread. */
export type WorkerToMainMessage =
  | LoadedMessage
  | LoadErrorMessage
  | ResultMessage
  | ErrorMessage
  | CapabilityRequestMessage;

// ─── Type Guards ─────────────────────────────────────────────────────────────

/** Known `type` values for messages sent from the main thread to the Worker. */
const MAIN_TO_WORKER_TYPES = new Set<string>([
  'load',
  'execute',
  'capabilityResult',
  'capabilityDenied',
  'terminate',
]);

/** Known `type` values for messages sent from the Worker to the main thread. */
const WORKER_TO_MAIN_TYPES = new Set<string>([
  'loaded',
  'loadError',
  'result',
  'error',
  'capability',
]);

/**
 * Returns `true` when `msg` is a well-formed `MainToWorkerMessage`.
 *
 * Only validates the `type` discriminant — callers are responsible for
 * narrowing to the specific message sub-type as needed.
 */
export function isMainToWorkerMessage(msg: unknown): msg is MainToWorkerMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    typeof (msg as Record<string, unknown>)['type'] === 'string' &&
    MAIN_TO_WORKER_TYPES.has((msg as Record<string, unknown>)['type'] as string)
  );
}

/**
 * Returns `true` when `msg` is a well-formed `WorkerToMainMessage`.
 *
 * Only validates the `type` discriminant — callers are responsible for
 * narrowing to the specific message sub-type as needed.
 */
export function isWorkerToMainMessage(msg: unknown): msg is WorkerToMainMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    typeof (msg as Record<string, unknown>)['type'] === 'string' &&
    WORKER_TO_MAIN_TYPES.has((msg as Record<string, unknown>)['type'] as string)
  );
}

// ─── Error Classes ────────────────────────────────────────────────────────────

/**
 * Thrown when a plugin attempts to call a capability for which it has not
 * been granted the required permission.
 */
export class PermissionDeniedError extends Error {
  override readonly name = 'PermissionDeniedError';
  /** The permission string that was missing (e.g. `'network'`). */
  readonly permission: string;
  /** The capability method that was attempted. */
  readonly method: string;

  constructor(permission: string, method: string) {
    super(`Permission denied: '${permission}' is required to call '${method}'`);
    this.permission = permission;
    this.method = method;
  }
}

/**
 * Thrown when a capability request or tool execution exceeds its allowed
 * time budget.
 */
export class TimeoutError extends Error {
  override readonly name = 'TimeoutError';
  /** The request identifier that timed out. */
  readonly requestId: string;
  /** The timeout threshold that was exceeded, in milliseconds. */
  readonly timeoutMs: number;

  constructor(requestId: string, timeoutMs: number) {
    super(`Request '${requestId}' timed out after ${timeoutMs} ms`);
    this.requestId = requestId;
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Thrown when the sandbox Worker crashes or sends an unrecoverable error
 * that prevents further interaction with the plugin.
 */
export class PluginCrashError extends Error {
  override readonly name = 'PluginCrashError';
  /** Identifier of the plugin whose Worker crashed. */
  readonly pluginId: string;

  constructor(pluginId: string, message: string) {
    super(`Plugin '${pluginId}' crashed: ${message}`);
    this.pluginId = pluginId;
  }
}
