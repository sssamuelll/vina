/**
 * SetupWizard — Fullscreen onboarding overlay shown on first launch when
 * no LLM provider is configured. Guides the user through selecting a
 * provider, entering an API key, and choosing a model.
 *
 * @module components/SetupWizard
 */

import { useState } from 'react';
import {
  saveProviderConfig,
  MODEL_OPTIONS,
  type ProviderConfig,
} from '../../copilot/providers/types';
import './SetupWizard.css';

// ─── Provider definitions for the card selector ────────────────────────────

interface ProviderOption {
  id: ProviderConfig['provider'];
  name: string;
  description: string;
  needsKey: boolean;
  defaultModel: string;
}

const PROVIDERS: ProviderOption[] = [
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    description: 'Best for pattern analysis',
    needsKey: true,
    defaultModel: 'claude-sonnet-4-20250514',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT-4o — fast and reliable',
    needsKey: true,
    defaultModel: 'gpt-4o',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    description: 'Affordable — great for testing',
    needsKey: true,
    defaultModel: 'deepseek-chat',
  },
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    description: 'Free — runs on your machine',
    needsKey: false,
    defaultModel: 'llama3',
  },
  {
    id: 'claude-bridge',
    name: 'Claude Code Bridge',
    description: 'Use your Claude Code session',
    needsKey: false,
    defaultModel: 'claude-code',
  },
];

// ─── Component ─────────────────────────────────────────────────────────────

interface SetupWizardProps {
  onComplete: () => void;
}

export default function SetupWizard({ onComplete }: SetupWizardProps) {
  const [selectedProvider, setSelectedProvider] = useState<ProviderOption | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // ── Derived state ────────────────────────────────────────────────────────

  const models = selectedProvider ? (MODEL_OPTIONS[selectedProvider.id] ?? []) : [];
  const activeModel = model || selectedProvider?.defaultModel || '';

  const canSubmit =
    selectedProvider !== null &&
    (selectedProvider.needsKey ? apiKey.trim().length > 0 : true) &&
    !saving;

  // ── Handlers ─────────────────────────────────────────────────────────────

  function handleProviderSelect(provider: ProviderOption) {
    setSelectedProvider(provider);
    setApiKey('');
    setModel('');
    setError('');
  }

  async function handleSubmit() {
    if (!selectedProvider || saving) return;

    setSaving(true);
    setError('');

    try {
      const config: ProviderConfig = {
        provider: selectedProvider.id,
        apiKey: selectedProvider.needsKey ? apiKey.trim() : '',
        model: activeModel,
        ...(selectedProvider.id === 'ollama' ? { baseUrl: ollamaUrl.trim() } : {}),
      };

      await saveProviderConfig(config);
      localStorage.setItem('openclo-setup-complete', 'true');
      onComplete();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save configuration');
      setSaving(false);
    }
  }

  // No skip — AI provider is required for core functionality

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="setup-wizard">
      <div className="setup-wizard__card">
        {/* Logo */}
        <div className="setup-wizard__logo">
          <div className="setup-wizard__logo-icon">
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </div>
          <div className="setup-wizard__logo-text">
            Open<span>Clo</span>.ai
          </div>
        </div>

        {/* Heading */}
        <h1 className="setup-wizard__heading">Welcome to OpenClo.ai</h1>
        <p className="setup-wizard__subheading">
          OpenClo uses AI to understand your patterns — classifying pieces,
          detecting seams, and assisting with design decisions. Connect your AI
          provider to get started.
        </p>

        {/* Provider cards */}
        <div className="setup-wizard__providers">
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={
                'setup-wizard__provider-card' +
                (selectedProvider?.id === p.id
                  ? ' setup-wizard__provider-card--selected'
                  : '')
              }
              onClick={() => handleProviderSelect(p)}
            >
              <div className="setup-wizard__provider-name">{p.name}</div>
              <div className="setup-wizard__provider-desc">{p.description}</div>
            </button>
          ))}
        </div>

        {/* Config fields (visible when a provider is selected) */}
        {selectedProvider && (
          <div className="setup-wizard__config">
            {/* API Key / Ollama URL */}
            <div className="setup-wizard__field">
              <label className="setup-wizard__label" htmlFor="setup-key">
                {selectedProvider.id === 'ollama' ? 'Ollama URL' : 'API Key'}
              </label>
              {selectedProvider.id === 'ollama' ? (
                <input
                  id="setup-key"
                  className="setup-wizard__input"
                  type="url"
                  value={ollamaUrl}
                  onChange={(e) => setOllamaUrl(e.target.value)}
                  placeholder="http://localhost:11434"
                  autoFocus
                />
              ) : (
                <input
                  id="setup-key"
                  className="setup-wizard__input"
                  type="password"
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    setError('');
                  }}
                  placeholder={
                    selectedProvider.id === 'anthropic'
                      ? 'sk-ant-...'
                      : selectedProvider.id === 'deepseek'
                      ? 'sk-...'
                      : 'sk-...'
                  }
                  autoFocus
                />
              )}
              {error && <div className="setup-wizard__error">{error}</div>}
            </div>

            {/* Model selector */}
            <div className="setup-wizard__field">
              <label className="setup-wizard__label" htmlFor="setup-model">
                Model
              </label>
              {selectedProvider.id === 'ollama' ? (
                <input
                  id="setup-model"
                  className="setup-wizard__input"
                  type="text"
                  value={model || selectedProvider.defaultModel}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="llama3"
                />
              ) : (
                <select
                  id="setup-model"
                  className="setup-wizard__select"
                  value={activeModel}
                  onChange={(e) => setModel(e.target.value)}
                >
                  {models.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="setup-wizard__actions">
          <button
            type="button"
            className="setup-wizard__submit"
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            {saving ? 'Saving...' : 'Start Designing'}
          </button>
        </div>
      </div>
    </div>
  );
}
