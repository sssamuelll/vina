/**
 * DynamicProviderForm — renders provider-specific fields from registry
 * metadata. Eliminates the if/else-per-provider chains that accumulated
 * patches in the old `AgentSettings.tsx`.
 *
 * Form state is OWNED by the parent and passed in via props. The form
 * is purely presentational — it does not own `apiKey` itself, which
 * is what kills the race condition: every field's state lives in the
 * parent's namespaced `formByConnection[id]` slot.
 *
 * @module connections/DynamicProviderForm
 */

import { useState } from 'react';
import type { ProviderId, ProviderMetadata } from './types';
import { PROVIDER_REGISTRY } from './registry';

export interface ProviderFormValues {
  label: string;
  apiKey: string;
  model: string;
  baseUrl: string;
}

interface Props {
  provider: ProviderId;
  values: ProviderFormValues;
  onChange: (next: ProviderFormValues) => void;
  /** Disable provider-locked fields (e.g. when editing an existing connection). */
  providerLocked?: boolean;
}

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--text-secondary)',
  fontWeight: 600,
};

const fieldStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  marginBottom: 12,
};

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-primary)',
  border: '1px solid var(--border)',
  color: 'var(--text-primary)',
  padding: '8px 10px',
  borderRadius: 5,
  fontSize: 14,
  fontFamily: "'SF Mono', 'Fira Code', monospace",
};

const hintStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--text-muted)',
  lineHeight: 1.5,
};

export default function DynamicProviderForm({ provider, values, onChange, providerLocked }: Props) {
  const meta: ProviderMetadata = PROVIDER_REGISTRY[provider];
  const [showKey, setShowKey] = useState(false);

  const set = <K extends keyof ProviderFormValues>(key: K, value: ProviderFormValues[K]) => {
    onChange({ ...values, [key]: value });
  };

  return (
    <div>
      {/* Custom label — always shown */}
      <div style={fieldStyle}>
        <label style={labelStyle}>Label</label>
        <input
          type="text"
          style={inputStyle}
          placeholder={meta.defaultLabel}
          value={values.label}
          onChange={(e) => set('label', e.target.value)}
        />
        <span style={hintStyle}>Optional display name. Helps when you have multiple connections.</span>
      </div>

      {/* Provider info banner when locked (edit mode) */}
      {providerLocked && (
        <div
          style={{
            fontSize: 12,
            color: 'var(--text-muted)',
            background: 'var(--bg-elevated)',
            padding: '8px 12px',
            borderRadius: 5,
            marginBottom: 12,
            lineHeight: 1.5,
          }}
        >
          Provider: <strong style={{ color: 'var(--text-primary)' }}>{meta.label}</strong> (cannot be changed after creation — delete and re-add to switch provider)
        </div>
      )}

      {/* API key (if applicable) */}
      {meta.apiKey && (
        <div style={fieldStyle}>
          <label style={labelStyle}>API Key</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type={showKey ? 'text' : 'password'}
              style={{ ...inputStyle, flex: 1 }}
              placeholder={meta.apiKey.placeholder}
              value={values.apiKey}
              onChange={(e) => set('apiKey', e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              style={{
                background: 'transparent',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border)',
                padding: '7px 12px',
                borderRadius: 5,
                fontSize: 12,
                cursor: 'pointer',
                fontWeight: 500,
              }}
              aria-label={showKey ? 'Hide key' : 'Show key'}
            >
              {showKey ? 'Hide' : 'Show'}
            </button>
          </div>
          {meta.helpUrl && (
            <span style={hintStyle}>
              Get a key at{' '}
              <a
                href={meta.helpUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--text-accent, var(--accent, #6366f1))' }}
              >
                {meta.helpUrl.replace(/^https?:\/\//, '')}
              </a>
            </span>
          )}
        </div>
      )}

      {/* Base URL (if applicable) */}
      {meta.baseUrl && (
        <div style={fieldStyle}>
          <label style={labelStyle}>{meta.baseUrl.label ?? 'Base URL'}</label>
          <input
            type="text"
            style={inputStyle}
            placeholder={meta.baseUrl.placeholder}
            value={values.baseUrl}
            onChange={(e) => set('baseUrl', e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          {!meta.baseUrl.required && (
            <span style={hintStyle}>
              Optional override. Leave empty to use the default ({meta.baseUrl.defaultValue ?? 'provider default'}).
            </span>
          )}
        </div>
      )}

      {/* Model */}
      <div style={fieldStyle}>
        <label style={labelStyle}>Model</label>
        <select
          style={inputStyle}
          value={values.model}
          onChange={(e) => set('model', e.target.value)}
        >
          {meta.models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      {meta.hint && <div style={hintStyle}>{meta.hint}</div>}
    </div>
  );
}
