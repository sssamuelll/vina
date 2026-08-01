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

const LANGUAGE_STORAGE_KEY = 'vina-language-pref';

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

/**
 * Type scale aligned with modern desktop-app conventions (Linear / Cursor /
 * Notion baseline of ~14px body). Pre-2026-05-28 the panel scaled 9-13px
 * across the board which was unreadable on standard DPI; bumped ~30% so
 * labels are 12-13px, body content is 13-14px, and helper text stays at
 * 11-12px (never below 11). Badges remain compact at 10px uppercase, but
 * gain extra horizontal padding to keep weight visible.
 */
const panelStyle: React.CSSProperties = {
  background: 'var(--bg-secondary)',
  borderBottom: '1px solid var(--border)',
  fontSize: 13,
  maxHeight: '80vh',
  display: 'flex',
  flexDirection: 'column',
};

const contentStyle: React.CSSProperties = {
  flex: 1,
  padding: 18,
  overflowY: 'auto',
};

const footerStyle: React.CSSProperties = {
  display: 'flex',
  gap: 10,
  justifyContent: 'flex-end',
  padding: 16,
  paddingTop: 14,
  borderTop: '1px solid var(--border)',
  background: 'var(--bg-secondary)',
};

const sectionStyle: React.CSSProperties = {
  borderTop: '1px solid var(--border)',
  paddingTop: 14,
  marginTop: 18,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--text-secondary)',
  fontWeight: 600,
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

const fieldStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  marginBottom: 12,
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  marginBottom: 10,
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h4 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Ajustes del agente</h4>
          <button
            onClick={onClose}
            style={{ ...btnSecondaryStyle, padding: '4px 10px', fontSize: 13 }}
            title="Cerrar ajustes"
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
            <label style={{ ...labelStyle, flex: 1, fontSize: 13 }}>Modo enseñanza</label>
            <input
              type="checkbox"
              checked={teachingMode}
              onChange={(e) => setTeachingModeState(e.target.checked)}
              style={{ width: 16, height: 16, cursor: 'pointer' }}
            />
            <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 40 }}>
              {teachingMode ? 'Activado' : 'Desactivado'}
            </span>
          </div>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            Al activarlo, el agente explica el porqué de cada acción (formación en patronaje).
          </span>
        </div>

        {/* Language Preference */}
        <div style={{ ...fieldStyle, marginTop: 18 }}>
          <label style={{ ...labelStyle, fontSize: 13 }}>Idioma</label>
          <select
            style={inputStyle}
            value={language}
            onChange={(e) => setLanguage(e.target.value as LanguagePreference)}
          >
            <option value="auto">Detección automática</option>
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
                <label style={labelStyle}>Presupuesto mensual (USD)</label>
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
              <label style={{ ...labelStyle, fontSize: 13, marginBottom: 10, display: 'block' }}>Uso de tokens</label>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr',
                  gap: 10,
                  fontSize: 12,
                }}
              >
                <div style={{ background: 'var(--bg-primary)', padding: 10, borderRadius: 5, textAlign: 'center' }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 14 }}>{formatCost(sessionCost)}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 3 }}>Esta sesión</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>{formatTokens(sessionCost)} tokens</div>
                </div>
                <div style={{ background: 'var(--bg-primary)', padding: 10, borderRadius: 5, textAlign: 'center' }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 14 }}>{formatCost(projectCost)}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 3 }}>Este proyecto</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>{formatTokens(projectCost)} tokens</div>
                </div>
                <div style={{ background: 'var(--bg-primary)', padding: 10, borderRadius: 5, textAlign: 'center' }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 14 }}>${budgetValue.toFixed(2)}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 3 }}>Presupuesto</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>al mes</div>
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
                🗑 Borrar conversación
              </button>
            )}
            {onClearMemory && (
              <button style={btnSecondaryStyle} onClick={onClearMemory}>
                🧹 Borrar memoria
              </button>
            )}
          </div>
        )}
      </div>

      {/* Footer — Save preferences. Connections persist immediately, not on Save. */}
      <div style={footerStyle}>
        <button style={btnSecondaryStyle} onClick={onClose}>Cerrar</button>
        <button style={btnStyle} onClick={handleSavePrefs}>Guardar preferencias</button>
      </div>
    </div>
  );
}
