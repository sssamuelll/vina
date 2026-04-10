import { useState, useEffect } from 'react';
import {
  loadProviderConfig,
  saveProviderConfig,
  MODEL_OPTIONS,
  PROVIDER_OPTIONS,
  type ProviderConfig,
} from '../../copilot/providers/types';

export default function UnifiedBarSettings() {
  const [config, setConfig] = useState<ProviderConfig | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadProviderConfig().then(c => {
      if (c) { setConfig(c); setApiKey(c.apiKey || ''); }
    });
  }, []);

  const handleSave = async (updates: Partial<ProviderConfig>) => {
    const updated = { ...(config || { provider: 'deepseek' as const, apiKey: '', model: 'deepseek-chat' }), ...updates } as ProviderConfig;
    setSaving(true);
    await saveProviderConfig(updated);
    setConfig(updated);
    setSaving(false);
  };

  const models = config ? (MODEL_OPTIONS[config.provider] ?? []) : [];

  return (
    <div style={{ padding: 'var(--sp-3) var(--sp-4)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
      {/* Provider */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 'var(--text-ui)', color: 'var(--text-secondary)' }}>AI Provider</span>
        <div style={{ display: 'flex', gap: '4px' }}>
          {PROVIDER_OPTIONS.map(p => (
            <button
              key={p.value}
              style={{
                padding: '3px 10px', fontSize: 'var(--text-sm)', borderRadius: '5px',
                color: config?.provider === p.value ? 'var(--text-primary)' : 'var(--text-muted)',
                background: config?.provider === p.value ? 'var(--accent-subtle)' : 'var(--bg-surface)',
                border: config?.provider === p.value ? '1px solid var(--accent-border)' : '1px solid var(--border)',
              }}
              onClick={() => handleSave({ provider: p.value as ProviderConfig['provider'], model: p.defaultModel })}
            >
              {p.label.split(' ')[0]}
            </button>
          ))}
        </div>
      </div>

      {/* Model */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 'var(--text-ui)', color: 'var(--text-secondary)' }}>Model</span>
        <select
          value={config?.model || ''}
          onChange={e => handleSave({ model: e.target.value })}
          style={{
            padding: '3px 10px', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)',
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
            borderRadius: '5px', outline: 'none',
          }}
        >
          {models.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      {/* API Key */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 'var(--text-ui)', color: 'var(--text-secondary)' }}>API Key</span>
        <input
          type="password"
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
          onBlur={() => handleSave({ apiKey })}
          placeholder="sk-..."
          style={{
            width: '180px', padding: '3px 10px', fontSize: 'var(--text-sm)',
            fontFamily: 'var(--font-mono)', color: 'var(--text-ghost)',
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
            borderRadius: '5px', outline: 'none',
          }}
        />
      </div>

      <div style={{ height: 1, background: 'var(--border)' }} />

      {saving && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--accent)' }}>Saving...</span>}
    </div>
  );
}
