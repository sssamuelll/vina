/**
 * Agent Settings Panel — dedicated configuration UI for the AI copilot.
 *
 * Accessible from the CopilotPanel gear icon. Provides controls for:
 * - Provider selection (Anthropic / OpenAI / Ollama / None)
 * - API key management (masked input, localStorage)
 * - Model selection per provider
 * - Teaching mode toggle
 * - Language preference
 * - Budget limit
 * - Token usage display
 * - Ollama connection status
 * - Reset / Clear actions
 *
 * @module AgentSettings
 */

import { useState, useEffect, useCallback } from 'react';
import {
  ProviderConfig,
  loadProviderConfig,
  saveProviderConfig,
  PROVIDER_OPTIONS,
  MODEL_OPTIONS,
} from './providers/types';
import { SecureStorage } from './providers/secureStorage';
import {
  detectOllama,
  listOllamaModels,
  loadOllamaConfig,
  saveOllamaConfig,
  OLLAMA_DEFAULT_URL,
} from './providers/ollama';
import { isTeachingModeEnabled, setTeachingMode } from './teachingContext';
import type { CostSummary } from './costManager';

// ─── Language Preference ────────────────────────────────────────────────────

/** Language preference options */
export type LanguagePreference = 'auto' | 'es' | 'en';

const LANGUAGE_STORAGE_KEY = 'openclo-language-pref';

/**
 * Load language preference from localStorage.
 *
 * @returns Saved preference or 'auto'
 */
// eslint-disable-next-line react-refresh/only-export-components
export function loadLanguagePreference(): LanguagePreference {
  try {
    const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (saved === 'es' || saved === 'en' || saved === 'auto') return saved;
  } catch { /* ignore */ }
  return 'auto';
}

/**
 * Save language preference to localStorage.
 *
 * @param pref - Language preference to save
 */
// eslint-disable-next-line react-refresh/only-export-components
export function saveLanguagePreference(pref: LanguagePreference): void {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, pref);
  } catch { /* ignore */ }
}

// ─── Component Props ────────────────────────────────────────────────────────

interface AgentSettingsProps {
  /** Called when settings are saved */
  onSave: (config: ProviderConfig | null) => void;
  /** Called to close the settings panel */
  onClose: () => void;
  /** Called to clear conversation */
  onClearConversation: () => void;
  /** Called to clear memory */
  onClearMemory: () => void;
  /** Current session cost summary */
  sessionCost?: CostSummary;
  /** Current project cost summary */
  projectCost?: CostSummary;
  /** Monthly budget */
  budget?: number;
  /** Called when budget changes */
  onBudgetChange?: (budget: number) => void;
}

/**
 * Agent Settings Panel component.
 *
 * Renders a comprehensive settings UI for configuring the AI copilot,
 * including provider selection, API keys, model choices, and usage tracking.
 */
export default function AgentSettings({
  onSave,
  onClose,
  onClearConversation,
  onClearMemory,
  sessionCost,
  projectCost,
  budget,
  onBudgetChange,
}: AgentSettingsProps) {
  const existingConfig = loadProviderConfig();
  const ollamaConfig = loadOllamaConfig();

  const [provider, setProvider] = useState<ProviderConfig['provider']>(
    existingConfig?.provider ?? 'anthropic'
  );
  const [apiKey, setApiKey] = useState(existingConfig?.apiKey ?? '');
  const [model, setModel] = useState(existingConfig?.model ?? 'claude-sonnet-4-20250514');
  const [teachingMode, setTeachingModeState] = useState(isTeachingModeEnabled);
  const [language, setLanguage] = useState<LanguagePreference>(loadLanguagePreference);
  const [budgetValue, setBudgetValue] = useState(budget ?? 5);

  // Ollama state
  const [ollamaUrl, setOllamaUrl] = useState(ollamaConfig.url);
  const [ollamaStatus, setOllamaStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);

  // Check Ollama status on mount and when URL changes
  useEffect(() => {
    if (provider === 'ollama') {
      setOllamaStatus('checking');
      detectOllama(ollamaUrl).then(isRunning => {
        setOllamaStatus(isRunning ? 'connected' : 'disconnected');
        if (isRunning) {
          listOllamaModels(ollamaUrl).then(models => {
            if (models.length > 0) setOllamaModels(models);
          });
        }
      });
    }
  }, [provider, ollamaUrl]);

  // Update model when provider changes
  const handleProviderChange = useCallback((newProvider: string) => {
    const p = newProvider as ProviderConfig['provider'];
    setProvider(p);
    const opt = PROVIDER_OPTIONS.find(o => o.value === p);
    if (opt) setModel(opt.defaultModel);
    // Load API key from SecureStorage for the selected provider
    if (p !== 'ollama') {
      const storedKey = SecureStorage.get(`${p}-apikey`) ?? '';
      setApiKey(storedKey);
    }
  }, []);

  const handleSave = useCallback(() => {
    // Save teaching mode
    setTeachingMode(teachingMode);
    saveLanguagePreference(language);

    if (provider === 'claude-bridge') {
      const config: ProviderConfig = {
        provider: 'claude-bridge',
        apiKey: '', // Uses Claude Code CLI, no API key needed
        model: 'claude-code',
        baseUrl: apiKey.trim() || undefined, // Reuse API key field for bridge URL
      };
      saveProviderConfig(config);
      onSave(config);
    } else if (provider === 'ollama') {
      saveOllamaConfig({ url: ollamaUrl, model, autoDetect: true });
      const config: ProviderConfig = {
        provider: 'ollama',
        apiKey: '', // Ollama doesn't need an API key
        model,
        baseUrl: ollamaUrl,
      };
      saveProviderConfig(config);
      onSave(config);
    } else if (apiKey.trim()) {
      const config: ProviderConfig = { provider, apiKey, model };
      saveProviderConfig(config);
      onSave(config);
    } else {
      onSave(null);
    }

    if (onBudgetChange) onBudgetChange(budgetValue);
    onClose();
  }, [provider, apiKey, model, teachingMode, language, ollamaUrl, budgetValue, onSave, onClose, onBudgetChange]);

  const formatCost = (cost: CostSummary | undefined): string => {
    if (!cost || cost.calls === 0) return '$0.00';
    return `$${cost.estimatedCost.toFixed(2)}`;
  };

  const formatTokens = (cost: CostSummary | undefined): string => {
    if (!cost || cost.tokens === 0) return '0';
    if (cost.tokens > 1000000) return `${(cost.tokens / 1000000).toFixed(1)}M`;
    if (cost.tokens > 1000) return `${(cost.tokens / 1000).toFixed(1)}K`;
    return String(cost.tokens);
  };

  const panelStyle: React.CSSProperties = {
    background: 'var(--bg-secondary)',
    borderBottom: '1px solid var(--border)',
    fontSize: 11,
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column',
  };

  const contentStyle: React.CSSProperties = {
    flex: 1,
    padding: 16,
    overflowY: 'auto',
  };

  const footerStyle: React.CSSProperties = {
    marginTop: 14,
    display: 'flex',
    gap: 8,
    justifyContent: 'flex-end',
    padding: 16,
    paddingTop: 12,
    borderTop: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
  };

  const fieldStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    marginBottom: 10,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 10,
    color: 'var(--text-secondary)',
    fontWeight: 600,
  };

  const inputStyle: React.CSSProperties = {
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
    padding: '6px 8px',
    borderRadius: 4,
    fontSize: 11,
    fontFamily: "'SF Mono', 'Fira Code', monospace",
  };

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  };

  const sectionStyle: React.CSSProperties = {
    borderTop: '1px solid var(--border)',
    paddingTop: 10,
    marginTop: 10,
  };

  const btnStyle: React.CSSProperties = {
    background: 'var(--accent)',
    color: 'white',
    border: 'none',
    padding: '6px 16px',
    borderRadius: 4,
    fontSize: 11,
    cursor: 'pointer',
    fontWeight: 600,
  };

  const btnSecondaryStyle: React.CSSProperties = {
    background: 'transparent',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border)',
    padding: '5px 12px',
    borderRadius: 4,
    fontSize: 10,
    cursor: 'pointer',
  };

  const statusDot = (status: typeof ollamaStatus): React.CSSProperties => ({
    width: 8,
    height: 8,
    borderRadius: '50%',
    background:
      status === 'connected' ? '#4caf50' :
      status === 'disconnected' ? '#f44336' :
      '#ff9800',
    display: 'inline-block',
  });

  return (
    <div style={panelStyle}>
      <div style={contentStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h4 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Agent Settings</h4>
          <button
            onClick={onClose}
            style={{ ...btnSecondaryStyle, padding: '2px 8px' }}
            title="Close settings"
          >
            ✕
          </button>
        </div>

      {/* Provider Selection */}
      <div style={fieldStyle}>
        <label style={labelStyle}>Provider</label>
        <select
          style={inputStyle}
          value={provider}
          onChange={e => handleProviderChange(e.target.value)}
        >
          {PROVIDER_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* API Key (not for Ollama or Claude Bridge) */}
      {provider !== 'ollama' && provider !== 'claude-bridge' && (
        <div style={fieldStyle}>
          <label style={labelStyle}>API Key</label>
          <input
            type="password"
            style={inputStyle}
            placeholder={provider === 'anthropic' ? 'sk-ant-...' : 'sk-...'}
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
          />
          <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
            {provider === 'anthropic' ? 'console.anthropic.com/settings/keys' : 'platform.openai.com/api-keys'}
          </span>
        </div>
      )}

      {/* Claude Bridge URL */}
      {provider === 'claude-bridge' && (
        <div style={fieldStyle}>
          <label style={labelStyle}>Bridge URL (optional)</label>
          <input
            type="text"
            style={inputStyle}
            placeholder="http://localhost:3200"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
          />
          <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
            Leave empty for default. Run: node server/claude-bridge.mjs
          </span>
        </div>
      )}

      {/* Ollama URL & Status */}
      {provider === 'ollama' && (
        <>
          <div style={fieldStyle}>
            <label style={labelStyle}>Ollama URL</label>
            <input
              type="text"
              style={inputStyle}
              value={ollamaUrl}
              onChange={e => setOllamaUrl(e.target.value)}
              placeholder={OLLAMA_DEFAULT_URL}
            />
          </div>
          <div style={rowStyle}>
            <span style={statusDot(ollamaStatus)} />
            <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
              {ollamaStatus === 'connected' ? 'Connected' :
               ollamaStatus === 'disconnected' ? 'Not running — start Ollama first' :
               'Checking...'}
              {ollamaModels.length > 0 && ` (${ollamaModels.length} models available)`}
            </span>
          </div>
        </>
      )}

      {/* Model Selection */}
      <div style={fieldStyle}>
        <label style={labelStyle}>Model</label>
        <select
          style={inputStyle}
          value={model}
          onChange={e => setModel(e.target.value)}
        >
          {(provider === 'ollama' && ollamaModels.length > 0
            ? ollamaModels
            : MODEL_OPTIONS[provider] || []
          ).map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>

      {/* Teaching Mode */}
      <div style={{ ...sectionStyle }}>
        <div style={rowStyle}>
          <label style={{ ...labelStyle, flex: 1 }}>Teaching Mode</label>
          <input
            type="checkbox"
            checked={teachingMode}
            onChange={e => setTeachingModeState(e.target.checked)}
          />
          <span style={{ fontSize: 9, color: 'var(--text-muted)', minWidth: 40 }}>
            {teachingMode ? 'ON' : 'OFF'}
          </span>
        </div>
        <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
          When on, the agent explains the WHY behind each action (patronaje education).
        </span>
      </div>

      {/* Language Preference */}
      <div style={{ ...fieldStyle, marginTop: 10 }}>
        <label style={labelStyle}>Language</label>
        <select
          style={inputStyle}
          value={language}
          onChange={e => setLanguage(e.target.value as LanguagePreference)}
        >
          <option value="auto">Auto-detect</option>
          <option value="es">Español</option>
          <option value="en">English</option>
        </select>
      </div>

      {/* Budget */}
      <div style={{ ...sectionStyle }}>
        <div style={fieldStyle}>
          <label style={labelStyle}>Monthly Budget (USD)</label>
          <input
            type="number"
            style={inputStyle}
            value={budgetValue}
            onChange={e => setBudgetValue(parseFloat(e.target.value) || 0)}
            min={0}
            step={1}
          />
        </div>
      </div>

      {/* Token Usage Display */}
      <div style={{ ...sectionStyle }}>
        <label style={{ ...labelStyle, marginBottom: 6, display: 'block' }}>Token Usage</label>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 8,
          fontSize: 10,
        }}>
          <div style={{ background: 'var(--bg-primary)', padding: 8, borderRadius: 4, textAlign: 'center' }}>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{formatCost(sessionCost)}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 9 }}>This session</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 8 }}>{formatTokens(sessionCost)} tokens</div>
          </div>
          <div style={{ background: 'var(--bg-primary)', padding: 8, borderRadius: 4, textAlign: 'center' }}>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{formatCost(projectCost)}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 9 }}>This project</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 8 }}>{formatTokens(projectCost)} tokens</div>
          </div>
          <div style={{ background: 'var(--bg-primary)', padding: 8, borderRadius: 4, textAlign: 'center' }}>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>${budgetValue.toFixed(2)}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 9 }}>Budget</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 8 }}>per month</div>
          </div>
        </div>
      </div>

        {/* Actions */}
        <div style={{ ...sectionStyle, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button style={btnSecondaryStyle} onClick={onClearConversation}>
            🗑 Clear conversation
          </button>
          <button style={btnSecondaryStyle} onClick={onClearMemory}>
            🧹 Clear memory
          </button>
        </div>
      </div>

      {/* Save/Cancel - sticky at bottom */}
      <div style={footerStyle}>
        <button style={btnSecondaryStyle} onClick={onClose}>Cancel</button>
        <button style={btnStyle} onClick={handleSave}>Save</button>
      </div>
    </div>
  );
}
