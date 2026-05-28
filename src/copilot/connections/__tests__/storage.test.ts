/**
 * Storage tests for the connections module.
 *
 * Covers:
 * - Empty initial state on first load.
 * - Save / load round-trip preserves connections + activeConnectionId.
 * - addConnection auto-promotes first connection to active when none exists.
 * - updateConnection patches in place without touching siblings.
 * - removeConnection rolls active over to the next enabled connection.
 * - setActiveConnection refuses to point at a missing or disabled connection.
 * - normalise repairs a stale activeConnectionId pointing at a missing or
 *   disabled connection (corruption recovery on load).
 * - Migration from the legacy single-provider config in IDB
 *   (`settings/provider-config`) creates a connection with empty apiKey,
 *   preserves model + baseUrl, sets it active.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the storage module BEFORE importing anything that uses it.
const idbStore = new Map<string, unknown>();

vi.mock('../../../utils/storage', () => ({
  storageGet: vi.fn(async (store: string, key: string) => {
    return idbStore.get(`${store}/${key}`);
  }),
  storageSet: vi.fn(async (store: string, key: string, value: unknown) => {
    idbStore.set(`${store}/${key}`, value);
  }),
  storageDel: vi.fn(async (store: string, key: string) => {
    idbStore.delete(`${store}/${key}`);
  }),
}));

// Also mock newId so we get deterministic ids for assertion.
let idCounter = 0;
vi.mock('../../../utils/ids', () => ({
  newId: () => `id-${++idCounter}`,
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let storage: any;
beforeEach(async () => {
  idbStore.clear();
  idCounter = 0;
  storage = await import('../storage');
});

describe('connections/storage', () => {
  describe('loadConnectionsState', () => {
    it('returns an empty state when nothing is stored', async () => {
      const state = await storage.loadConnectionsState();
      expect(state).toEqual({
        version: 1,
        connections: [],
        activeConnectionId: null,
      });
    });

    it('reads back a previously saved state', async () => {
      const saved = {
        version: 1 as const,
        connections: [
          {
            id: 'a',
            provider: 'anthropic' as const,
            label: 'Mine',
            apiKey: 'sk-ant-test',
            model: 'claude-sonnet-4-20250514',
            enabled: true,
            createdAt: 1,
          },
        ],
        activeConnectionId: 'a',
      };
      await storage.saveConnectionsState(saved);
      const loaded = await storage.loadConnectionsState();
      expect(loaded).toEqual(saved);
    });

    it('migrates a legacy provider-config record into a connection', async () => {
      // Seed the legacy shape directly into the mock IDB.
      idbStore.set('settings/provider-config', {
        provider: 'deepseek',
        model: 'deepseek-v4-pro',
        baseUrl: undefined,
      });
      const state = await storage.loadConnectionsState();
      expect(state.connections).toHaveLength(1);
      expect(state.connections[0]).toMatchObject({
        provider: 'deepseek',
        label: 'DeepSeek',
        apiKey: '', // not recoverable from legacy SecureStorage
        model: 'deepseek-v4-pro',
        enabled: true,
      });
      expect(state.activeConnectionId).toBe(state.connections[0].id);
    });

    it('returns empty state when legacy record references an unknown provider', async () => {
      idbStore.set('settings/provider-config', {
        provider: 'never-existed',
        model: 'whatever',
      });
      const state = await storage.loadConnectionsState();
      expect(state.connections).toHaveLength(0);
    });

    it('normalises a stale activeConnectionId that points at a missing connection', async () => {
      await storage.saveConnectionsState({
        version: 1,
        connections: [
          {
            id: 'real',
            provider: 'anthropic',
            label: 'Real',
            apiKey: 'k',
            model: 'm',
            enabled: true,
            createdAt: 1,
          },
        ],
        activeConnectionId: 'ghost',
      });
      const state = await storage.loadConnectionsState();
      // Falls back to the first enabled connection.
      expect(state.activeConnectionId).toBe('real');
    });

    it('normalises a stale activeConnectionId pointing at a disabled connection', async () => {
      await storage.saveConnectionsState({
        version: 1,
        connections: [
          { id: 'a', provider: 'anthropic', label: 'A', apiKey: 'k', model: 'm', enabled: false, createdAt: 1 },
          { id: 'b', provider: 'openai', label: 'B', apiKey: 'k', model: 'm', enabled: true, createdAt: 2 },
        ],
        activeConnectionId: 'a',
      });
      const state = await storage.loadConnectionsState();
      expect(state.activeConnectionId).toBe('b');
    });
  });

  describe('addConnection', () => {
    it('appends and auto-promotes the first connection to active', () => {
      const empty = { version: 1 as const, connections: [], activeConnectionId: null };
      const next = storage.addConnection(empty, {
        provider: 'anthropic',
        label: 'A',
        apiKey: 'k',
        model: 'm',
        enabled: true,
      });
      expect(next.connections).toHaveLength(1);
      expect(next.activeConnectionId).toBe(next.connections[0].id);
    });

    it('does not change activeConnectionId when one is already set', () => {
      const first = storage.addConnection(
        { version: 1, connections: [], activeConnectionId: null },
        { provider: 'anthropic', label: 'A', apiKey: 'k', model: 'm', enabled: true },
      );
      const second = storage.addConnection(first, {
        provider: 'openai',
        label: 'B',
        apiKey: 'k',
        model: 'm',
        enabled: true,
      });
      expect(second.activeConnectionId).toBe(first.activeConnectionId);
      expect(second.connections).toHaveLength(2);
    });

    it('does not promote a disabled connection to active when none is set', () => {
      const next = storage.addConnection(
        { version: 1, connections: [], activeConnectionId: null },
        { provider: 'anthropic', label: 'A', apiKey: 'k', model: 'm', enabled: false },
      );
      expect(next.activeConnectionId).toBeNull();
    });
  });

  describe('updateConnection', () => {
    it('patches the targeted connection only', () => {
      const start = storage.addConnection(
        { version: 1, connections: [], activeConnectionId: null },
        { provider: 'anthropic', label: 'A', apiKey: 'k', model: 'm', enabled: true },
      );
      const targetId = start.connections[0].id;
      const next = storage.updateConnection(start, targetId, { apiKey: 'new-key', model: 'new-model' });
      expect(next.connections[0]).toMatchObject({ apiKey: 'new-key', model: 'new-model', label: 'A' });
    });
  });

  describe('removeConnection', () => {
    it('removes the connection and shifts active to the next enabled one', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let s: any = { version: 1 as const, connections: [], activeConnectionId: null };
      s = storage.addConnection(s, { provider: 'anthropic', label: 'A', apiKey: 'k', model: 'm', enabled: true });
      s = storage.addConnection(s, { provider: 'openai', label: 'B', apiKey: 'k', model: 'm', enabled: true });
      const activeBefore = s.activeConnectionId!;
      const next = storage.removeConnection(s, activeBefore);
      expect(next.connections).toHaveLength(1);
      expect(next.activeConnectionId).toBe(next.connections[0].id);
    });

    it('sets activeConnectionId to null when the last connection is removed', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let s: any = { version: 1 as const, connections: [], activeConnectionId: null };
      s = storage.addConnection(s, { provider: 'anthropic', label: 'A', apiKey: 'k', model: 'm', enabled: true });
      const next = storage.removeConnection(s, s.connections[0].id);
      expect(next.connections).toHaveLength(0);
      expect(next.activeConnectionId).toBeNull();
    });
  });

  describe('setActiveConnection', () => {
    it('refuses to activate a missing connection', () => {
      const start = storage.addConnection(
        { version: 1, connections: [], activeConnectionId: null },
        { provider: 'anthropic', label: 'A', apiKey: 'k', model: 'm', enabled: true },
      );
      const next = storage.setActiveConnection(start, 'ghost');
      expect(next).toBe(start); // unchanged
    });

    it('refuses to activate a disabled connection', () => {
      let s = storage.addConnection(
        { version: 1, connections: [], activeConnectionId: null },
        { provider: 'anthropic', label: 'A', apiKey: 'k', model: 'm', enabled: true },
      );
      s = storage.addConnection(s, { provider: 'openai', label: 'B', apiKey: 'k', model: 'm', enabled: false });
      const disabledId = s.connections[1].id;
      const next = storage.setActiveConnection(s, disabledId);
      expect(next.activeConnectionId).not.toBe(disabledId);
    });

    it('activates a valid enabled connection', () => {
      let s = storage.addConnection(
        { version: 1, connections: [], activeConnectionId: null },
        { provider: 'anthropic', label: 'A', apiKey: 'k', model: 'm', enabled: true },
      );
      s = storage.addConnection(s, { provider: 'openai', label: 'B', apiKey: 'k', model: 'm', enabled: true });
      const targetId = s.connections[1].id;
      const next = storage.setActiveConnection(s, targetId);
      expect(next.activeConnectionId).toBe(targetId);
    });

    it('clears the active pointer when given null', () => {
      const start = storage.addConnection(
        { version: 1, connections: [], activeConnectionId: null },
        { provider: 'anthropic', label: 'A', apiKey: 'k', model: 'm', enabled: true },
      );
      const next = storage.setActiveConnection(start, null);
      expect(next.activeConnectionId).toBeNull();
    });
  });

  describe('getActiveConnection', () => {
    it('returns null when no connection is active', () => {
      expect(
        storage.getActiveConnection({ version: 1, connections: [], activeConnectionId: null }),
      ).toBeNull();
    });

    it('returns the connection matching activeConnectionId', () => {
      const start = storage.addConnection(
        { version: 1, connections: [], activeConnectionId: null },
        { provider: 'anthropic', label: 'A', apiKey: 'k', model: 'm', enabled: true },
      );
      const active = storage.getActiveConnection(start);
      expect(active?.label).toBe('A');
    });
  });
});
