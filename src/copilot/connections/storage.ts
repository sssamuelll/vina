/**
 * Connections storage — IDB-canonical multi-connection persistence with
 * automatic migration from the pre-2026-05-28 single-provider config.
 *
 * Storage layout (IDB, store 'settings'):
 *   key 'connections'           → ConnectionsState
 *   key 'provider-config'       → (legacy, single-provider) — migrated then deleted
 *
 * @module connections/storage
 */

// shape: ConnectionsState v1 — opt-in envelope: no
//
// LS-only justification (per CLAUDE.md B6-state): not LS, this writes to
// IDB via storageSet — the canonical persistence layer for vina. The
// inline shape comment above documents the schema for future readers
// (per the B6 inline-comment convention).

import { storageGet, storageSet } from '../../utils/storage';
import { newId } from '../../utils/ids';
import type { AIConnection, ConnectionsState, ProviderId } from './types';
import { PROVIDER_REGISTRY } from './registry';

const CONNECTIONS_KEY = 'connections';
const LEGACY_PROVIDER_CONFIG_KEY = 'provider-config';

const EMPTY_STATE: ConnectionsState = {
  version: 1,
  connections: [],
  activeConnectionId: null,
};

// ─── Load ───────────────────────────────────────────────────────────────────

/**
 * Load the connections state from IDB. Performs a one-shot migration from
 * the legacy single-provider config the first time it runs and there is
 * no existing connections record yet.
 */
export async function loadConnectionsState(): Promise<ConnectionsState> {
  // Fast path: connections already exist.
  const existing = await storageGet<ConnectionsState>('settings', CONNECTIONS_KEY);
  if (existing && existing.version === 1) return normalise(existing);

  // Migration path: try to recover the legacy single-provider config.
  // Legacy shape: { provider, model, baseUrl } stored at 'settings'/'provider-config'.
  // The API key WAS in SecureStorage (sessionStorage + ephemeral key), which is
  // not recoverable after a page reload — those keys are gone. The migration
  // captures everything else and leaves apiKey blank; the user re-enters once.
  const legacy = await storageGet<{
    provider?: string;
    model?: string;
    baseUrl?: string;
  }>('settings', LEGACY_PROVIDER_CONFIG_KEY);

  if (legacy?.provider) {
    const provider = legacy.provider as ProviderId;
    const meta = PROVIDER_REGISTRY[provider];
    if (meta) {
      const connection: AIConnection = {
        id: newId(),
        provider,
        label: meta.defaultLabel,
        apiKey: '',
        model: legacy.model || meta.defaultModel,
        baseUrl: legacy.baseUrl,
        enabled: true,
        createdAt: Date.now(),
      };
      const migrated: ConnectionsState = {
        version: 1,
        connections: [connection],
        activeConnectionId: connection.id,
      };
      await storageSet('settings', CONNECTIONS_KEY, migrated);
      // Intentionally do NOT delete the legacy key — it lets the user
      // recover their model/baseUrl choices if migration goes wrong.
      // It can be purged in a future cleanup PR once the migration
      // has been deployed for a few weeks.
      return migrated;
    }
  }

  return EMPTY_STATE;
}

// ─── Save ───────────────────────────────────────────────────────────────────

export async function saveConnectionsState(state: ConnectionsState): Promise<void> {
  await storageSet('settings', CONNECTIONS_KEY, normalise(state));
}

// ─── Mutations (pure — return a new state) ──────────────────────────────────

/**
 * Add a new connection. If this is the first connection, automatically
 * promote it to active so the user is not left without a useful default.
 */
export function addConnection(
  state: ConnectionsState,
  partial: Omit<AIConnection, 'id' | 'createdAt'> & { id?: string },
): ConnectionsState {
  const connection: AIConnection = {
    ...partial,
    id: partial.id ?? newId(),
    createdAt: Date.now(),
  };
  const connections = [...state.connections, connection];
  const activeConnectionId =
    state.activeConnectionId ?? (connection.enabled ? connection.id : null);
  return { version: 1, connections, activeConnectionId };
}

export function updateConnection(
  state: ConnectionsState,
  id: string,
  patch: Partial<Omit<AIConnection, 'id' | 'createdAt'>>,
): ConnectionsState {
  const connections = state.connections.map((c) =>
    c.id === id ? { ...c, ...patch } : c,
  );
  return { ...state, version: 1, connections };
}

export function removeConnection(
  state: ConnectionsState,
  id: string,
): ConnectionsState {
  const connections = state.connections.filter((c) => c.id !== id);
  // If we just removed the active connection, fall back to the first
  // enabled remaining one, or null if none left.
  let activeConnectionId = state.activeConnectionId;
  if (activeConnectionId === id) {
    activeConnectionId = connections.find((c) => c.enabled)?.id ?? null;
  }
  return { version: 1, connections, activeConnectionId };
}

/**
 * Set the active connection. Returns the state unchanged if the target
 * does not exist or is disabled.
 */
export function setActiveConnection(
  state: ConnectionsState,
  id: string | null,
): ConnectionsState {
  if (id === null) return { ...state, version: 1, activeConnectionId: null };
  const target = state.connections.find((c) => c.id === id);
  if (!target || !target.enabled) return state;
  return { ...state, version: 1, activeConnectionId: id };
}

// ─── Selectors ──────────────────────────────────────────────────────────────

export function getActiveConnection(state: ConnectionsState): AIConnection | null {
  if (!state.activeConnectionId) return null;
  return state.connections.find((c) => c.id === state.activeConnectionId) ?? null;
}

// ─── Internal ──────────────────────────────────────────────────────────────

/**
 * Normalise a state object — guarantee that `activeConnectionId` points
 * at a real, enabled connection. Protects against state corruption from
 * external edits or out-of-sync writes.
 */
function normalise(state: ConnectionsState): ConnectionsState {
  let activeConnectionId = state.activeConnectionId;
  if (activeConnectionId) {
    const target = state.connections.find((c) => c.id === activeConnectionId);
    if (!target || !target.enabled) {
      activeConnectionId = state.connections.find((c) => c.enabled)?.id ?? null;
    }
  }
  return { version: 1, connections: state.connections, activeConnectionId };
}
