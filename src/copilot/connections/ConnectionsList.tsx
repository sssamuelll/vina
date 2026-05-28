/**
 * ConnectionsList — main view for managing AI connections.
 *
 * Replaces the AgentSettings monolith's provider section. Loads state
 * from `connections/storage`, renders a list of cards plus an "Add"
 * button, owns the modal lifecycle. Persistence happens on every
 * mutation — there is no separate "Save" button for connections.
 * The user's previous mental model of "type and forget to save" is
 * now structurally impossible.
 *
 * @module connections/ConnectionsList
 */

import { useEffect, useState, useCallback } from 'react';
import type { AIConnection, ConnectionsState } from './types';
import {
  loadConnectionsState,
  saveConnectionsState,
  addConnection,
  updateConnection,
  removeConnection,
  setActiveConnection,
} from './storage';
import ConnectionCard from './ConnectionCard';
import ConnectionModal from './ConnectionModal';

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 4,
};

const addBtnStyle: React.CSSProperties = {
  background: 'var(--accent, #6366f1)',
  color: 'white',
  border: 'none',
  padding: '5px 10px',
  borderRadius: 4,
  fontSize: 10,
  cursor: 'pointer',
  fontWeight: 600,
};

const emptyStyle: React.CSSProperties = {
  textAlign: 'center',
  padding: '24px 16px',
  color: 'var(--text-muted)',
  fontSize: 11,
  border: '1px dashed var(--border)',
  borderRadius: 6,
};

interface Props {
  /**
   * Fired after any persisted change (add / update / delete / active
   * switch). The host can use this to dispatch the
   * `openclo:provider-config-changed` event for downstream consumers.
   */
  onStateChange?: (state: ConnectionsState) => void;
}

export default function ConnectionsList({ onStateChange }: Props) {
  const [state, setState] = useState<ConnectionsState | null>(null);
  const [modal, setModal] = useState<
    { mode: 'add' } | { mode: 'edit'; connection: AIConnection } | null
  >(null);

  // Initial load + cross-tab refresh on storage change events.
  useEffect(() => {
    loadConnectionsState().then(setState);
  }, []);

  const persist = useCallback(
    async (next: ConnectionsState) => {
      setState(next);
      await saveConnectionsState(next);
      onStateChange?.(next);
      window.dispatchEvent(new CustomEvent('openclo:provider-config-changed'));
    },
    [onStateChange],
  );

  if (!state) {
    return <div style={{ ...emptyStyle, padding: '16px' }}>Loading connections…</div>;
  }

  const handleAdd = () => setModal({ mode: 'add' });

  const handleSaveAdd = (partial: Omit<AIConnection, 'id' | 'createdAt'>) => {
    persist(addConnection(state, partial));
    setModal(null);
  };

  const handleSaveEdit = (
    id: string,
    patch: Partial<Omit<AIConnection, 'id' | 'createdAt'>>,
  ) => {
    persist(updateConnection(state, id, patch));
    setModal(null);
  };

  const handleToggleEnabled = (c: AIConnection) => {
    const next = updateConnection(state, c.id, { enabled: !c.enabled });
    // Disabling the active connection clears the active pointer.
    const final =
      !c.enabled || state.activeConnectionId !== c.id
        ? next
        : setActiveConnection(next, null);
    persist(final);
  };

  const handleSetActive = (c: AIConnection) => {
    if (!c.enabled) return;
    persist(setActiveConnection(state, c.id));
  };

  const handleDelete = (c: AIConnection) => {
    if (!confirm(`Delete connection "${c.label}"?`)) return;
    persist(removeConnection(state, c.id));
  };

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>
          Connections ({state.connections.length})
        </span>
        <button type="button" style={addBtnStyle} onClick={handleAdd}>
          + Add connection
        </button>
      </div>

      {state.connections.length === 0 ? (
        <div style={emptyStyle}>
          No AI connections yet.
          <br />
          <button
            type="button"
            style={{
              ...addBtnStyle,
              marginTop: 10,
              padding: '6px 14px',
              fontSize: 11,
            }}
            onClick={handleAdd}
          >
            + Add your first connection
          </button>
        </div>
      ) : (
        state.connections.map((c) => (
          <ConnectionCard
            key={c.id}
            connection={c}
            isActive={c.id === state.activeConnectionId}
            onSetActive={() => handleSetActive(c)}
            onToggleEnabled={() => handleToggleEnabled(c)}
            onEdit={() => setModal({ mode: 'edit', connection: c })}
            onDelete={() => handleDelete(c)}
          />
        ))
      )}

      {modal?.mode === 'add' && (
        <ConnectionModal mode="add" onSave={handleSaveAdd} onClose={() => setModal(null)} />
      )}
      {modal?.mode === 'edit' && (
        <ConnectionModal
          mode="edit"
          connection={modal.connection}
          onSave={handleSaveEdit}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
