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
import { useDispatch } from 'react-redux';
import { requestConfirmation } from '../../hooks/useGuardedAction';
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
  gap: 10,
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 6,
};

const addBtnStyle: React.CSSProperties = {
  background: 'var(--accent-fuerte)',
  color: 'white',
  border: 'none',
  padding: '7px 14px',
  borderRadius: 5,
  fontSize: 13,
  cursor: 'pointer',
  fontWeight: 600,
  lineHeight: 1.2,
};

const emptyStyle: React.CSSProperties = {
  textAlign: 'center',
  padding: '32px 20px',
  color: 'var(--text-muted)',
  fontSize: 13,
  border: '1px dashed var(--border)',
  borderRadius: 6,
  lineHeight: 1.5,
};

interface Props {
  /**
   * Fired after any persisted change (add / update / delete / active
   * switch). The host can use this to dispatch the
   * `vina:provider-config-changed` event for downstream consumers.
   */
  onStateChange?: (state: ConnectionsState) => void;
}

export default function ConnectionsList({ onStateChange }: Props) {
  const dispatch = useDispatch();
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
      window.dispatchEvent(new CustomEvent('vina:provider-config-changed'));
    },
    [onStateChange],
  );

  if (!state) {
    return <div style={{ ...emptyStyle, padding: '20px' }}>Cargando conexiones…</div>;
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

  const handleDelete = async (c: AIConnection) => {
    const ok = await requestConfirmation(dispatch, {
      title: '¿Eliminar la conexión?',
      description: `Se borra «${c.label}» de la lista de conexiones.`,
      consequences: ['Hay que volver a escribir la clave si la agregas de nuevo'],
      confirmLabel: 'Eliminar la conexión',
    });
    if (ok) persist(removeConnection(state, c.id));
  };

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>
          Conexiones ({state.connections.length})
        </span>
        <button type="button" style={addBtnStyle} onClick={handleAdd}>
          + Agregar conexión
        </button>
      </div>

      {state.connections.length === 0 ? (
        <div style={emptyStyle}>
          Aún no hay conexiones de IA.
          <br />
          <button
            type="button"
            style={{
              ...addBtnStyle,
              marginTop: 14,
              padding: '8px 18px',
              fontSize: 13,
            }}
            onClick={handleAdd}
          >
            + Agregar tu primera conexión
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
