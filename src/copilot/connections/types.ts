/**
 * AI Connection types — the new multi-provider configuration model.
 *
 * Replaces the pre-2026-05-28 single-provider `ProviderConfig` shape that
 * stored one provider/key/model at a time. The new model treats provider
 * configurations as a list of independent connection records; the user
 * can keep Anthropic + DeepSeek + Vercel-Gateway all configured and
 * switch the "active" one without retyping. Each connection has its
 * own namespaced fields, eliminating the race condition where typed
 * input for provider B was overwritten by an async load of provider A's
 * saved key (the canonical bug in the old shared `apiKey` slot, also
 * documented at cline/cline#10520).
 *
 * @module connections/types
 */

import type { LLMProvider, ProviderConfig } from '../providers/types';

/** Canonical provider identifiers — must match `ProviderConfig.provider`. */
export type ProviderId = ProviderConfig['provider'];

/**
 * A single configured AI connection.
 *
 * Each connection is INDEPENDENT — the API key and model live in a slot
 * keyed by `id`, never in a shared mutable form state. Switching the
 * active connection does not touch any other connection's data.
 */
export interface AIConnection {
  /** Stable identifier (newId() at creation). Used for storage keys. */
  id: string;
  /** Which underlying LLM provider this connection routes to. */
  provider: ProviderId;
  /**
   * User-supplied or auto-derived display label, e.g. "Personal Anthropic"
   * or "Work DeepSeek". Defaults to the provider's defaultLabel at create.
   */
  label: string;
  /**
   * The API key as the user typed it. Stored directly in IDB.
   *
   * Security model (deliberate, documented in code):
   *   API keys are persisted in IndexedDB under the vina origin.
   *   Anyone with access to this browser profile can read them. This
   *   matches Cursor / Continue.dev / Open-WebUI / chatbot-ui defaults.
   *
   * The pre-2026-05-28 SecureStorage path used sessionStorage + an
   *   in-memory AES key that was regenerated on every page reload.
   *   Result: keys were lost on every refresh — security theatre with
   *   actively bad UX. Switching to plain IDB makes the persistence
   *   honest about the threat model (local-machine trust) and ends
   *   the "I saved my key and it disappeared" complaint.
   *
   * Empty string == not yet configured.
   */
  apiKey: string;
  /** Model identifier for this connection. Format depends on provider. */
  model: string;
  /** Optional base URL override (Ollama URL, custom endpoint, etc.). */
  baseUrl?: string;
  /**
   * Whether this connection is enabled. Disabled connections are kept
   * in the list but cannot be made active. Default: true at create.
   */
  enabled: boolean;
  /** Unix milliseconds at creation. */
  createdAt: number;
  /** Unix milliseconds at last successful send (optional, updated lazily). */
  lastUsedAt?: number;
}

/** The full connections collection that gets persisted. */
export interface ConnectionsState {
  /** Schema version, for future migrations. */
  version: 1;
  /** All configured connections, in creation order. */
  connections: AIConnection[];
  /**
   * Pointer to the active connection. May be `null` when no connection
   * is configured yet, or when the user explicitly deselects.
   */
  activeConnectionId: string | null;
}

/**
 * Per-provider field schema — drives the dynamic form rendering.
 * Lives alongside `ProviderId` so the UI never has to switch over
 * provider IDs.
 */
export interface ProviderMetadata {
  id: ProviderId;
  /** Display label in pickers and badges, e.g. "Anthropic (API)". */
  label: string;
  /** Short label used when auto-deriving a connection's label. */
  defaultLabel: string;
  /** Default model selected when a new connection is created. */
  defaultModel: string;
  /**
   * Curated list of model IDs the user can pick. Future enhancement:
   * `fetch()` from the provider's `/v1/models` endpoint.
   */
  models: string[];
  /**
   * URL where the user can obtain an API key. Hardcoded per-provider
   * so we never again ship the wrong help link.
   * Pass `null` for providers that don't require a key (Ollama).
   */
  helpUrl: string | null;
  /**
   * API key field config. `null` means this provider has no API key
   * (currently only Ollama on default local install).
   */
  apiKey: {
    placeholder: string;
    required: boolean;
  } | null;
  /**
   * Base URL field config. `null` means no base URL field is shown.
   * `required: true` means the field is mandatory (e.g. Ollama).
   * `required: false` means optional override (e.g. Anthropic via proxy).
   */
  baseUrl: {
    placeholder: string;
    defaultValue?: string;
    required: boolean;
    /** Friendly label for the field, e.g. "Ollama URL" vs "Base URL". */
    label?: string;
  } | null;
  /** Optional one-line hint shown under the form. */
  hint?: string;
}

/**
 * Convert a saved `AIConnection` to the `ProviderConfig` shape the
 * existing LLM providers consume. Centralised so the provider layer
 * does not need to know about connections.
 */
export function connectionToProviderConfig(conn: AIConnection): ProviderConfig {
  return {
    provider: conn.provider,
    apiKey: conn.apiKey,
    model: conn.model,
    baseUrl: conn.baseUrl,
  };
}

/** Re-export for callers that want the provider type alongside connections. */
export type { LLMProvider, ProviderConfig };
