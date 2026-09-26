/**
 * ConnectionCard — single row in the connections list.
 *
 * Shows provider label, custom label, model, active badge, enable
 * toggle, edit and delete buttons. The "set active" affordance is
 * a radio-style action triggered by clicking the row body (anywhere
 * outside the explicit buttons).
 *
 * @module connections/ConnectionCard
 */

import type { AIConnection } from './types';
import { PROVIDER_REGISTRY } from './registry';

interface Props {
  connection: AIConnection;
  isActive: boolean;
  onSetActive: () => void;
  onToggleEnabled: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  padding: '12px 14px',
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  cursor: 'pointer',
  transition: 'border-color 0.15s ease, background 0.15s ease',
};

const cardActiveStyle: React.CSSProperties = {
  borderColor: 'var(--accent)',
  background: 'rgba(99, 102, 241, 0.08)',
};

const cardDisabledStyle: React.CSSProperties = {
  opacity: 0.55,
};

const labelStyle: React.CSSProperties = {
  fontSize: 14,
  color: 'var(--text-primary)',
  fontWeight: 600,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexWrap: 'wrap' as const,
};

const subLabelStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--text-muted)',
  marginTop: 4,
  lineHeight: 1.4,
};

const badgeStyle: React.CSSProperties = {
  fontSize: 10,
  color: 'white',
  background: 'var(--accent)',
  padding: '2px 8px',
  borderRadius: 999,
  fontWeight: 600,
  letterSpacing: 0.4,
  textTransform: 'uppercase' as const,
  lineHeight: 1.4,
};

const iconBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--border)',
  color: 'var(--text-secondary)',
  padding: '6px 12px',
  borderRadius: 5,
  fontSize: 12,
  cursor: 'pointer',
  fontWeight: 500,
};

const toggleStyle: React.CSSProperties = {
  position: 'relative',
  width: 36,
  height: 20,
  background: 'var(--bg-primary)',
  borderRadius: 999,
  border: '1px solid var(--border)',
  cursor: 'pointer',
  padding: 0,
  flexShrink: 0,
};

const toggleKnobStyle = (enabled: boolean): React.CSSProperties => ({
  position: 'absolute',
  top: 1,
  left: enabled ? 17 : 1,
  width: 16,
  height: 16,
  borderRadius: '50%',
  background: enabled ? 'var(--accent)' : 'var(--text-muted)',
  transition: 'left 0.15s ease, background 0.15s ease',
});

export default function ConnectionCard({
  connection,
  isActive,
  onSetActive,
  onToggleEnabled,
  onEdit,
  onDelete,
}: Props) {
  const meta = PROVIDER_REGISTRY[connection.provider];
  const hasKey = meta.apiKey === null || connection.apiKey.length > 0;

  const style: React.CSSProperties = {
    ...cardStyle,
    ...(isActive ? cardActiveStyle : {}),
    ...(!connection.enabled ? cardDisabledStyle : {}),
  };

  return (
    <div
      style={style}
      onClick={(e) => {
        // Only trigger set-active when clicking the row body, not the
        // interactive controls.
        const target = e.target as HTMLElement;
        if (target.closest('button')) return;
        if (!connection.enabled) return;
        onSetActive();
      }}
      role="button"
      tabIndex={0}
      aria-label={`Conexión ${connection.label}`}
    >
      <button
        type="button"
        style={toggleStyle}
        onClick={onToggleEnabled}
        aria-label={connection.enabled ? 'Desactivar conexión' : 'Activar conexión'}
        title={connection.enabled ? 'Desactivar' : 'Activar'}
      >
        <div style={toggleKnobStyle(connection.enabled)} />
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={labelStyle}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {connection.label}
          </span>
          {isActive && <span style={badgeStyle}>Activa</span>}
          {!hasKey && (
            <span
              style={{
                ...badgeStyle,
                background: 'var(--color-warning)',
              }}
            >
              Sin clave
            </span>
          )}
        </div>
        <div style={subLabelStyle}>
          {meta.label} · {connection.model}
        </div>
      </div>

      <button type="button" style={iconBtnStyle} onClick={onEdit} aria-label="Editar">
        Editar
      </button>
      <button
        type="button"
        style={{ ...iconBtnStyle, color: 'var(--color-error)' }}
        onClick={onDelete}
        aria-label="Eliminar"
      >
        Eliminar
      </button>
    </div>
  );
}
