/**
 * ConnectionModal — overlay used for both Add and Edit connection.
 *
 * Add mode: starts with provider picker, defaults the form values from
 * the picked provider's metadata.
 * Edit mode: provider is locked, fields are pre-filled from the
 * existing connection.
 *
 * Form state lives entirely inside this component so closing it
 * discards any unsaved input without polluting the parent.
 *
 * @module connections/ConnectionModal
 */

import { useState, useEffect } from 'react';
import type { AIConnection, ProviderId } from './types';
import { PROVIDER_REGISTRY, PROVIDER_LIST } from './registry';
import DynamicProviderForm, { type ProviderFormValues } from './DynamicProviderForm';

interface AddProps {
  mode: 'add';
  onSave: (connection: Omit<AIConnection, 'id' | 'createdAt'>) => void;
  onClose: () => void;
}

interface EditProps {
  mode: 'edit';
  connection: AIConnection;
  onSave: (id: string, patch: Partial<Omit<AIConnection, 'id' | 'createdAt'>>) => void;
  onClose: () => void;
}

type Props = AddProps | EditProps;

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.6)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 200,
};

const dialogStyle: React.CSSProperties = {
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  width: 'min(440px, 92vw)',
  maxHeight: '85vh',
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '0 16px 48px rgba(0, 0, 0, 0.5)',
};

const headerStyle: React.CSSProperties = {
  padding: '16px 18px',
  borderBottom: '1px solid var(--border)',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};

const bodyStyle: React.CSSProperties = {
  padding: 18,
  overflowY: 'auto',
};

const footerStyle: React.CSSProperties = {
  padding: 14,
  borderTop: '1px solid var(--border)',
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 10,
};

const btnStyle: React.CSSProperties = {
  background: 'var(--accent)',
  color: 'white',
  border: 'none',
  padding: '8px 18px',
  borderRadius: 5,
  fontSize: 13,
  cursor: 'pointer',
  fontWeight: 600,
};

const btnSecondaryStyle: React.CSSProperties = {
  background: 'transparent',
  color: 'var(--text-secondary)',
  border: '1px solid var(--border)',
  padding: '7px 14px',
  borderRadius: 5,
  fontSize: 12,
  cursor: 'pointer',
};

export default function ConnectionModal(props: Props) {
  const isEdit = props.mode === 'edit';
  const initialProvider: ProviderId = isEdit ? props.connection.provider : 'vercel-gateway';
  const [provider, setProvider] = useState<ProviderId>(initialProvider);

  const [values, setValues] = useState<ProviderFormValues>(() => {
    if (isEdit) {
      return {
        label: props.connection.label,
        apiKey: props.connection.apiKey,
        model: props.connection.model,
        baseUrl: props.connection.baseUrl ?? '',
      };
    }
    const meta = PROVIDER_REGISTRY[initialProvider];
    return {
      label: '',
      apiKey: '',
      model: meta.defaultModel,
      baseUrl: meta.baseUrl?.defaultValue ?? '',
    };
  });

  // When provider changes in Add mode, reset model + baseUrl + apiKey to
  // defaults so the new provider's schema is the source of truth. This is
  // the per-provider namespacing in action — apiKey is intentionally
  // wiped because it belongs to the previous provider's slot.
  useEffect(() => {
    if (isEdit) return;
    const meta = PROVIDER_REGISTRY[provider];
    setValues((v) => ({
      label: v.label, // user-supplied label survives provider change
      apiKey: '',
      model: meta.defaultModel,
      baseUrl: meta.baseUrl?.defaultValue ?? '',
    }));
  }, [provider, isEdit]);

  const meta = PROVIDER_REGISTRY[provider];

  const isValid = (() => {
    if (meta.apiKey?.required && !values.apiKey.trim()) return false;
    if (meta.baseUrl?.required && !values.baseUrl.trim()) return false;
    return true;
  })();

  const handleSave = () => {
    if (!isValid) return;
    const labelFinal = values.label.trim() || meta.defaultLabel;
    const baseUrl = values.baseUrl.trim() ? values.baseUrl.trim() : undefined;
    if (isEdit) {
      props.onSave(props.connection.id, {
        label: labelFinal,
        apiKey: values.apiKey,
        model: values.model,
        baseUrl,
      });
    } else {
      props.onSave({
        provider,
        label: labelFinal,
        apiKey: values.apiKey,
        model: values.model,
        baseUrl,
        enabled: true,
      });
    }
  };

  return (
    <div
      style={overlayStyle}
      onMouseDown={(e) => {
        // Click on backdrop closes; click inside dialog does not bubble.
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      <div style={dialogStyle} onMouseDown={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <h4 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
            {isEdit ? 'Edit connection' : 'Add connection'}
          </h4>
          <button
            type="button"
            onClick={props.onClose}
            style={{ ...btnSecondaryStyle, padding: '4px 10px', fontSize: 13 }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div style={bodyStyle}>
          {/* Provider picker (Add mode only) */}
          {!isEdit && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>
                Provider
              </label>
              <select
                style={{
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                  padding: '8px 10px',
                  borderRadius: 5,
                  fontSize: 14,
                }}
                value={provider}
                onChange={(e) => setProvider(e.target.value as ProviderId)}
              >
                {PROVIDER_LIST.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <DynamicProviderForm
            provider={provider}
            values={values}
            onChange={setValues}
            providerLocked={isEdit}
          />
        </div>
        <div style={footerStyle}>
          <button type="button" style={btnSecondaryStyle} onClick={props.onClose}>
            Cancel
          </button>
          <button
            type="button"
            style={{ ...btnStyle, opacity: isValid ? 1 : 0.5, cursor: isValid ? 'pointer' : 'not-allowed' }}
            onClick={handleSave}
            disabled={!isValid}
          >
            {isEdit ? 'Save changes' : 'Add connection'}
          </button>
        </div>
      </div>
    </div>
  );
}
