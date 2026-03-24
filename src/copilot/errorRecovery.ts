/**
 * Error Recovery — intelligent retry, fallback, and graceful degradation strategies.
 *
 * When a tool call or API request fails, the recovery system attempts to recover
 * automatically before surfacing the error to the user:
 *
 * - **Tool failures**: simplify parameters and retry (e.g. simpler outline)
 * - **Network errors**: exponential backoff with 3 attempts
 * - **Auth errors**: clear message with setup instructions
 * - **Provider unavailable**: fall back to alternate provider if configured
 * - **No API key**: offline mode — tools available without LLM
 *
 * @module errorRecovery
 */

import type { ProviderConfig } from './providers/types';
import { SecureStorage } from './providers/secureStorage';
import { safeGetItem, safeSetItem, safeRemoveItem } from '../utils/safeStorage';

// ─── Error Classification ───────────────────────────────────────────────────

/** Classified error type for recovery strategy selection */
export type ErrorType =
  | 'network'
  | 'auth'
  | 'rate_limit'
  | 'invalid_params'
  | 'provider_unavailable'
  | 'tool_execution'
  | 'unknown';

/**
 * Classify an error into a recovery-actionable type.
 *
 * Examines error messages, status codes, and error types to determine
 * the appropriate recovery strategy.
 *
 * @param error - The error to classify
 * @returns Classified error type
 */
export function classifyError(error: unknown): ErrorType {
  const msg = error instanceof Error ? error.message : String(error);
  const lower = msg.toLowerCase();

  // Auth errors — API key invalid or missing
  if (
    lower.includes('401') ||
    lower.includes('403') ||
    lower.includes('unauthorized') ||
    lower.includes('invalid api key') ||
    lower.includes('invalid x-api-key') ||
    lower.includes('authentication')
  ) {
    return 'auth';
  }

  // Rate limit
  if (
    lower.includes('429') ||
    lower.includes('rate limit') ||
    lower.includes('too many requests') ||
    lower.includes('quota')
  ) {
    return 'rate_limit';
  }

  // Network errors
  if (
    lower.includes('fetch') ||
    lower.includes('network') ||
    lower.includes('econnrefused') ||
    lower.includes('enotfound') ||
    lower.includes('timeout') ||
    lower.includes('failed to fetch') ||
    lower.includes('503') ||
    lower.includes('502') ||
    lower.includes('504')
  ) {
    return 'network';
  }

  // Provider unavailable
  if (
    lower.includes('provider') ||
    lower.includes('unavailable') ||
    lower.includes('500')
  ) {
    return 'provider_unavailable';
  }

  // Invalid parameters (tool-level)
  if (
    lower.includes('invalid param') ||
    lower.includes('invalid outline') ||
    lower.includes('validation') ||
    lower.includes('missing required')
  ) {
    return 'invalid_params';
  }

  // Tool execution errors
  if (
    lower.includes('execution error') ||
    lower.includes('tool') ||
    lower.includes('piece') ||
    lower.includes('not found')
  ) {
    return 'tool_execution';
  }

  return 'unknown';
}

// ─── Recovery Strategies ────────────────────────────────────────────────────

/**
 * Result of a recovery attempt.
 */
export interface RecoveryResult {
  /** Whether recovery was successful */
  recovered: boolean;
  /** If recovered, the result value */
  result?: unknown;
  /** Human-readable message about what happened */
  message: string;
  /** How many retry attempts were used */
  attempts: number;
}

/** Options for retry with exponential backoff */
export interface RetryOptions {
  /** Maximum number of attempts (default 3) */
  maxAttempts?: number;
  /** Base delay in ms (default 1000) */
  baseDelayMs?: number;
  /** Maximum delay in ms (default 10000) */
  maxDelayMs?: number;
}

/**
 * Sleep for a given duration.
 * @param ms - Milliseconds to wait
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay with jitter.
 *
 * @param attempt - Current attempt number (0-based)
 * @param baseMs - Base delay in milliseconds
 * @param maxMs - Maximum delay cap in milliseconds
 * @returns Delay in milliseconds
 */
export function calculateBackoff(attempt: number, baseMs: number = 1000, maxMs: number = 10000): number {
  const exponential = baseMs * Math.pow(2, attempt);
  const jitter = Math.random() * baseMs * 0.5;
  return Math.min(exponential + jitter, maxMs);
}

/**
 * Retry a function with exponential backoff.
 *
 * Attempts the function up to `maxAttempts` times, with increasing delays
 * between failures. Only retries on network and rate_limit errors.
 *
 * @param fn - Async function to retry
 * @param options - Retry configuration
 * @returns Recovery result
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<RecoveryResult> {
  const { maxAttempts = 3, baseDelayMs = 1000, maxDelayMs = 10000 } = options;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const result = await fn();
      return {
        recovered: attempt > 0,
        result,
        message: attempt > 0 ? `Succeeded after ${attempt + 1} attempts` : 'Succeeded on first attempt',
        attempts: attempt + 1,
      };
    } catch (e) {
      lastError = e;
      const errorType = classifyError(e);

      // Only retry on retryable errors
      if (errorType !== 'network' && errorType !== 'rate_limit' && errorType !== 'provider_unavailable') {
        return {
          recovered: false,
          message: getErrorMessage(errorType, e),
          attempts: attempt + 1,
        };
      }

      // Don't sleep after the last attempt
      if (attempt < maxAttempts - 1) {
        const delay = calculateBackoff(attempt, baseDelayMs, maxDelayMs);
        await sleep(delay);
      }
    }
  }

  const errorType = classifyError(lastError);
  return {
    recovered: false,
    message: `Failed after ${maxAttempts} attempts: ${getErrorMessage(errorType, lastError)}`,
    attempts: maxAttempts,
  };
}

/**
 * Get a human-readable error message with actionable instructions.
 *
 * @param errorType - Classified error type
 * @param error - Original error
 * @returns User-facing error message
 */
export function getErrorMessage(errorType: ErrorType, error: unknown): string {
  // Avoid double-wrapping already-formatted errors
  if (error instanceof Error && (error as Error & { _formatted?: boolean })._formatted) {
    return error.message;
  }
  const rawMsg = error instanceof Error ? (error.message || error.constructor.name) : String(error);

  switch (errorType) {
    case 'auth':
      return '🔑 API key is invalid or expired. Go to Chat → Settings (⚙️) to update your API key. ' +
        'Get one at: Anthropic → console.anthropic.com/settings/keys | OpenAI → platform.openai.com/api-keys';

    case 'rate_limit':
      return '⏳ Rate limit reached. Wait a moment and try again, or switch to a different model/provider in Settings.';

    case 'network':
      return '🌐 Network error — could not reach the AI provider. Check your internet connection and try again.';

    case 'provider_unavailable':
      return '🔧 AI provider is temporarily unavailable. Try again in a moment, or switch providers in Settings.';

    case 'invalid_params':
      return `⚠️ Invalid parameters: ${rawMsg}. The agent will attempt with simplified values.`;

    case 'tool_execution':
      return `🔧 Tool error: ${rawMsg}`;

    case 'unknown':
    default:
      return `❌ Unexpected error: ${rawMsg}`;
  }
}

// ─── Tool Recovery ──────────────────────────────────────────────────────────

/**
 * Simplify an outline by reducing control points for retry after outline validation failure.
 *
 * Converts complex curves to line segments and reduces point count,
 * creating a simpler outline that's more likely to validate.
 *
 * @param outline - The original outline that failed validation
 * @returns Simplified outline array
 */
export function simplifyOutline(
  outline: Array<{ type: string; values: number[] }>,
): Array<{ type: string; values: number[] }> {
  // Only simplify if there are curves to simplify
  const hasCurves = outline.some(cmd => cmd.type === 'C' || cmd.type === 'Q');
  if (!hasCurves) return outline;

  const simplified: Array<{ type: string; values: number[] }> = [];

  for (const cmd of outline) {
    if (cmd.type === 'C' && cmd.values.length >= 6) {
      // Convert cubic bezier to a line to its endpoint
      simplified.push({
        type: 'L',
        values: [cmd.values[4], cmd.values[5]],
      });
    } else if (cmd.type === 'Q' && cmd.values.length >= 4) {
      // Convert quadratic bezier to a line to its endpoint
      simplified.push({
        type: 'L',
        values: [cmd.values[2], cmd.values[3]],
      });
    } else {
      simplified.push(cmd);
    }
  }

  return simplified;
}

// ─── Provider Fallback ──────────────────────────────────────────────────────

/**
 * localStorage key for fallback provider configuration.
 * After migration, contains non-secret fields only (provider, model, baseUrl).
 * Note: the legacy format used this same key but stored the full config including
 * the API key. clearLegacyFallbackKeys() strips the apiKey field from any existing
 * entry at this key and migrates it to SecureStorage for the current session.
 */
const FALLBACK_PROVIDER_KEY = 'openclo-fallback-provider';
/** SecureStorage key for fallback provider API key */
const FALLBACK_APIKEY_SECURE_KEY = 'fallback-apikey';

/**
 * Strip any API key from the fallback provider config in localStorage and IndexedDB.
 * Re-saves the config without the apiKey field. Migrates the key to SecureStorage
 * for the current session so the user doesn't lose their fallback immediately.
 *
 * Idempotent — safe to call on every startup. No-ops if no apiKey field exists.
 * Call once on app startup to migrate away from insecure storage.
 */
export async function clearLegacyFallbackKeys(): Promise<void> {
  // Clean localStorage
  const saved = safeGetItem(FALLBACK_PROVIDER_KEY);
  if (!saved) return;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(saved);
  } catch (parseErr) {
    // Corrupted data — remove the entire key to be safe (may contain a key in raw text)
    console.warn('[Security] Failed to parse legacy fallback config, removing entire key:', parseErr);
    safeRemoveItem(FALLBACK_PROVIDER_KEY);
    return;
  }

  if (parsed && typeof parsed.apiKey === 'string' && parsed.apiKey.length > 0) {
    // Migrate API key to SecureStorage for the current session (encrypted)
    const stored = await SecureStorage.set(FALLBACK_APIKEY_SECURE_KEY, parsed.apiKey as string);
    if (!stored) {
      // Encryption failed — keep the key in localStorage rather than losing it
      console.warn('[Security] Could not encrypt legacy API key; leaving it in localStorage for now');
      return;
    }
    // Re-save without the API key (safe — SecureStorage has the encrypted copy)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { apiKey: _removed, ...rest } = parsed;
    safeSetItem(FALLBACK_PROVIDER_KEY, JSON.stringify(rest));
    console.info('[Security] Migrated legacy API key from localStorage to SecureStorage');
  }

  // Clean IndexedDB (async, fire-and-forget but with logging)
  import("../utils/storage").then(async ({ storageGet, storageSet }) => {
    try {
      const idbConfig = await storageGet("settings", "fallback-provider");
      if (idbConfig && typeof idbConfig === 'object' && 'apiKey' in idbConfig) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { apiKey: _removed, ...rest } = idbConfig as Record<string, unknown>;
        await storageSet("settings", "fallback-provider", rest);
        console.info('[Security] Cleared legacy API key from IndexedDB');
      }
    } catch (err) {
      console.warn('[Security] Failed to clean IndexedDB fallback provider entry:', err);
    }
  }).catch((err) => {
    console.warn('[Security] Failed to load storage module for IndexedDB cleanup:', err);
  });
}

/**
 * Load a fallback provider configuration.
 * Non-secret config from localStorage, API key from SecureStorage (sessionStorage).
 *
 * Note: after the browser tab is closed, the API key is lost (sessionStorage is
 * ephemeral). The user must re-enter it each session for fallback to be available.
 *
 * @returns Fallback provider config, or null if not configured
 */
export async function loadFallbackProvider(): Promise<ProviderConfig | null> {
  try {
    const saved = safeGetItem(FALLBACK_PROVIDER_KEY);
    if (!saved) return null;
    const config = JSON.parse(saved);
    // Retrieve API key from SecureStorage (encrypted, async)
    const apiKey = (await SecureStorage.get(FALLBACK_APIKEY_SECURE_KEY)) ?? '';
    return {
      provider: config.provider,
      model: config.model ?? '',
      baseUrl: config.baseUrl,
      apiKey,
    };
  } catch (err) {
    console.warn('[errorRecovery] Failed to load fallback provider config:', err);
  }
  return null;
}

/**
 * Save a fallback provider configuration.
 * API key goes to SecureStorage (sessionStorage, cleared on tab close),
 * non-secret config to localStorage and IndexedDB.
 *
 * @param config - Fallback provider configuration
 */
export async function saveFallbackProvider(config: ProviderConfig): Promise<void> {
  // Store API key in SecureStorage (AES-GCM encrypted, sessionStorage)
  const stored = await SecureStorage.set(FALLBACK_APIKEY_SECURE_KEY, config.apiKey);
  if (!stored) {
    console.warn('[errorRecovery] API key could not be stored securely; fallback provider may not work after page refresh');
  }
  // Store non-secret config in localStorage and IndexedDB
  const storedConfig = {
    provider: config.provider,
    model: config.model,
    baseUrl: config.baseUrl,
  };
  import("../utils/storage")
    .then(({ storageSet }) => { storageSet("settings", "fallback-provider", storedConfig); })
    .catch((err) => { console.warn('[errorRecovery] storageSet for fallback provider failed:', err); });
  safeSetItem(FALLBACK_PROVIDER_KEY, JSON.stringify(storedConfig));
}

/**
 * Check whether an alternate provider is available for fallback.
 *
 * @param currentProvider - The provider that just failed
 * @returns Whether a fallback provider is configured
 */
export async function hasFallbackProvider(currentProvider: string): Promise<boolean> {
  const fallback = await loadFallbackProvider();
  if (!fallback) return false;
  return fallback.provider !== currentProvider && fallback.apiKey.length > 0;
}

// ─── Offline Mode ───────────────────────────────────────────────────────────

/**
 * Check if the agent is in offline mode (no API key configured).
 *
 * In offline mode, tools are still available via direct UI interaction
 * (command palette style), but no LLM is used for natural language processing.
 *
 * @param config - Current provider configuration
 * @returns Whether the agent is in offline mode
 */
export function isOfflineMode(config: ProviderConfig | null): boolean {
  if (!config) return true;
  return !config.apiKey || config.apiKey.trim().length === 0;
}

/**
 * Quick actions available in offline mode.
 * These map directly to tool calls without requiring LLM interpretation.
 */
export interface OfflineAction {
  /** Display label (bilingual) */
  label: string;
  /** Tool name to execute */
  toolName: string;
  /** Default parameters */
  defaultParams: Record<string, unknown>;
  /** Icon emoji */
  icon: string;
}

/**
 * Get the list of available offline quick actions.
 *
 * @returns Array of offline actions that can be executed without an LLM
 */
export function getOfflineActions(): OfflineAction[] {
  return [
    { label: 'Crear corpiño / Create bodice', toolName: 'createPiece', defaultParams: { template: 'bodice-front', name: 'Bodice Front' }, icon: '👚' },
    { label: 'Crear manga / Create sleeve', toolName: 'createPiece', defaultParams: { template: 'sleeve', name: 'Sleeve' }, icon: '🦾' },
    { label: 'Crear falda / Create skirt', toolName: 'createPiece', defaultParams: { template: 'skirt-front', name: 'Skirt Front' }, icon: '👗' },
    { label: 'Crear pantalón / Create pants', toolName: 'createPiece', defaultParams: { template: 'pants-front', name: 'Pants Front' }, icon: '👖' },
    { label: 'Crear cuello / Create collar', toolName: 'createPiece', defaultParams: { template: 'collar', name: 'Collar' }, icon: '👔' },
    { label: 'Exportar DXF / Export DXF', toolName: 'exportDXF', defaultParams: {}, icon: '📄' },
    { label: 'Exportar PDF / Export PDF', toolName: 'exportPDF', defaultParams: {}, icon: '📄' },
    { label: 'Anidar / Nest pieces', toolName: 'runNesting', defaultParams: {}, icon: '🧵' },
    { label: 'Ver medidas / Get measurements', toolName: 'getMeasurements', defaultParams: {}, icon: '📏' },
    { label: 'Listar telas / List fabrics', toolName: 'listFabrics', defaultParams: {}, icon: '🧶' },
  ];
}

// ─── Recovery Strategy Class ────────────────────────────────────────────────

/**
 * Orchestrates error recovery across the agent system.
 *
 * Provides a unified interface for handling errors from tool execution,
 * API calls, and provider communication with appropriate strategies
 * per error type.
 */
export class RecoveryStrategy {
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;

  /**
   * Create a new RecoveryStrategy.
   *
   * @param maxRetries - Maximum retry attempts for retryable errors (default 3)
   * @param baseDelayMs - Base delay for exponential backoff (default 1000)
   */
  constructor(maxRetries: number = 3, baseDelayMs: number = 1000) {
    this.maxRetries = maxRetries;
    this.baseDelayMs = baseDelayMs;
  }

  /**
   * Attempt to recover from a tool execution error.
   *
   * Strategy depends on error type:
   * - invalid_params: simplify outline and retry
   * - network/rate_limit: exponential backoff
   * - auth: return setup instructions
   * - provider_unavailable: suggest fallback
   *
   * @param error - The error that occurred
   * @param retryFn - Function to retry the operation
   * @returns Recovery result
   */
  async recover<T>(
    error: unknown,
    retryFn: () => Promise<T>,
  ): Promise<RecoveryResult> {
    const errorType = classifyError(error);

    switch (errorType) {
      case 'network':
      case 'rate_limit':
        return retryWithBackoff(retryFn, {
          maxAttempts: this.maxRetries,
          baseDelayMs: this.baseDelayMs,
        });

      case 'auth':
        return {
          recovered: false,
          message: getErrorMessage('auth', error),
          attempts: 1,
        };

      case 'provider_unavailable':
        // Try once more then fail with message
        return retryWithBackoff(retryFn, {
          maxAttempts: 2,
          baseDelayMs: this.baseDelayMs,
        });

      case 'invalid_params':
        return {
          recovered: false,
          message: getErrorMessage('invalid_params', error),
          attempts: 1,
        };

      case 'tool_execution':
        return {
          recovered: false,
          message: getErrorMessage('tool_execution', error),
          attempts: 1,
        };

      default:
        return {
          recovered: false,
          message: getErrorMessage('unknown', error),
          attempts: 1,
        };
    }
  }

  /**
   * Wrap an async operation with automatic recovery.
   *
   * @param operation - The async operation to execute
   * @returns The result value, or throws after all recovery attempts fail
   */
  async withRecovery<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      // Log full error for debugging
      console.error('[RecoveryStrategy] Operation failed:', error);

      const recovery = await this.recover(error, operation);
      if (recovery.result !== undefined) {
        return recovery.result as T;
      }
      // Throw with the formatted message directly; mark it to avoid double-wrapping
      const wrapped = new Error(recovery.message);
      (wrapped as Error & { _formatted: boolean })._formatted = true;
      throw wrapped;
    }
  }
}
