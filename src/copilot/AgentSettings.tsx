/**
 * Agent Settings Panel — dedicated configuration UI for the AI copilot.
 *
 * Post-2026-05-28 redesign: the provider/key/model section is replaced
 * by `ConnectionsList` (list of independently-configured connections,
 * Open-WebUI / Lobe-style). The race condition where switching the
 * provider dropdown would overwrite typed input is eliminated
 * STRUCTURALLY — every connection's form state lives in its own
 * namespaced slot, and the per-connection modal unmounts on close.
 *
 * What this component still owns (it's now a thin shell):
 * - Teaching mode toggle
 * - Language preference
 * - Budget + token-usage (only when the host wires `onBudgetChange`)
 * - Clear-conversation / clear-memory actions (only when host wires them)
 *
 * What it no longer owns:
 * - Provider selection — moved into ConnectionsList + ConnectionModal
 * - API key input — moved into DynamicProviderForm (per-provider, namespaced)
 * - Model picker — moved into DynamicProviderForm (per-provider, namespaced)
 * - The `SecureStorage` async race — gone with the shared apiKey slot
 *
 * Mounted by UnifiedBar's `settings` mode. Host-agnostic — any container
 * can wire the optional cost / clear callbacks.
 *
 * @module AgentSettings
 */

import { useState } from 'react';
import { isTeachingModeEnabled, setTeachingMode } from './teachingContext';
import type { CostSummary } from './costManager';
import ConnectionsList from './connections/ConnectionsList';

// ─── Language Preference ────────────────────────────────────────────────────

export type LanguagePreference = 'auto' | 'es' | 'en';

const LANGUAGE_STORAGE_KEY = 'openclo-language-pref';

// eslint-disable-next-line react-refresh/only-export-components
export function loadLanguagePreference(): LanguagePreference {
  try {
    const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (saved === 'es' || saved === 'en' || saved === 'auto') return saved;
  } catch { /* ignore */ }
  return 'auto';
}

// eslint-disable-next-line react-refresh/only-export-components
export function saveLanguagePreference(pref: LanguagePreference): void {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, pref);
  } catch { /* ignore */ }
}

// ─── Component Props ────────────────────────────────────────────────────────

interface AgentSettingsProps {
  /** Called when the user closes the panel. */
  onClose: () => void;
  /**
   * Called when settings are saved. Kept for API compatibility with the
   * old surface — today this fires only for preferences (teaching mode,
   * language, budget). Connection changes persist immediately on every
   * mutation, so they do not flow through this callback.
   */
  onSave?: () => void;
  /** Optional clear conversation action (host wires when applicable). */
  onClearConversation?: () => void;
  /** Optional clear memory action (host wires when applicable). */
  onClearMemory?: () => void;
  /** Current session cost summary. Gates the budget section's visibility. */
  sessionCost?: CostSummary;
  /** Current project cost summary. Gates the budget section's visibility. */
  projectCost?: CostSummary;
  /** Monthly budget. */
  budget?: number;
  /** Called when budget changes. Gates the budget section's visibility. */
  onBudgetChange?: (budget: number) => void;
}

// ─── Styles ─────────────────────────────────────────────────────────────────

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
  display: 'flex',
  gap: 8,
  justifyContent: 'flex-end',
  padding: 16,
  paddingTop: 12,
  borderTop: '1px solid var(--border)',
  background: 'var(--bg-secondary)',
};

const sectionStyle: React.CSSProperties = {
  borderTop: '1px solid var(--border)',
  paddingTop: 10,
  marginTop: 14,
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

const fieldStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  marginBottom: 10,
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginBottom: 8,
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

// ─── Component ──────────────────────────────────────────────────────────────

export default function AgentSettings({
  onClose,
  onSave,
  onClearConversation,
  onClearMemory,
  sessionCost,
  projectCost,
  budget,
  onBudgetChange,
}: AgentSettingsProps) {
  const [teachingMode, setTeachingModeState] = useState(isTeachingModeEnabled);
  const [language, setLanguage] = useState<LanguagePreference>(loadLanguagePreference);
  const [budgetValue, setBudgetValue] = useState(budget ?? 5);

  const handleSavePrefs = () => {
    setTeachingMode(teachingMode);
    saveLanguagePreference(language);
    if (onBudgetChange) onBudgetChange(budgetValue);
    onSave?.();
    onClose();
  };

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

        {/* AI Connections — list of independently-configured providers.
            Persists immediately on every mutation. No race conditions
            because per-connection form state is fully namespaced. */}
        <ConnectionsList />

        {/* Teaching Mode */}
        <div style={sectionStyle}>
          <div style={rowStyle}>
            <label style={{ ...labelStyle, flex: 1 }}>Teaching Mode</label>
            <input
              type="checkbox"
              checked={teachingMode}
              onChange={(e) => setTeachingModeState(e.target.checked)}
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
        <div style={{ ...fieldStyle, marginTop: 14 }}>
          <label style={labelStyle}>Language</label>
          <select
            style={inputStyle}
            value={language}
            onChange={(e) => setLanguage(e.target.value as LanguagePreference)}
          >
            <option value="auto">Auto-detect</option>
            <option value="es">Español</option>
            <option value="en">English</option>
          </select>
        </div>

        {/* Budget + Token Usage — only rendered when the host wires a
           CostManager (signaled by `onBudgetChange`). UnifiedBar does
           not in MVP v1; hiding avoids a "$0.00 / silent-drop Budget"
           surface. */}
        {onBudgetChange && (
          <>
            <div style={sectionStyle}>
              <div style={fieldStyle}>
                <label style={labelStyle}>Monthly Budget (USD)</label>
                <input
                  type="number"
                  style={inputStyle}
                  value={budgetValue}
                  onChange={(e) => setBudgetValue(parseFloat(e.target.value) || 0)}
                  min={0}
                  step={1}
                />
              </div>
            </div>

            <div style={sectionStyle}>
              <label style={{ ...labelStyle, marginBottom: 6, display: 'block' }}>Token Usage</label>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr',
                  gap: 8,
                  fontSize: 10,
                }}
              >
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
          </>
        )}

        {/* Clear actions — only when host wires them */}
        {(onClearConversation || onClearMemory) && (
          <div style={{ ...sectionStyle, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {onClearConversation && (
              <button style={btnSecondaryStyle} onClick={onClearConversation}>
                🗑 Clear conversation
              </button>
            )}
            {onClearMemory && (
              <button style={btnSecondaryStyle} onClick={onClearMemory}>
                🧹 Clear memory
              </button>
            )}
          </div>
        )}
      </div>

      {/* Footer — Save preferences. Connections persist immediately, not on Save. */}
      <div style={footerStyle}>
        <button style={btnSecondaryStyle} onClick={onClose}>Close</button>
        <button style={btnStyle} onClick={handleSavePrefs}>Save preferences</button>
      </div>
    </div>
  );
}
