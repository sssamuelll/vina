import { useState, useRef, useEffect, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '../../store';
import { AgentConfig, CopilotMessage, buildCopilotContext } from '../../copilot/protocol';
import { sendToAgent } from '../../copilot/agentConnector';
import { executeCommands } from '../../copilot/commandExecutor';
import { getDefaultRegistry } from '../../copilot/tools/registry';
import { anthropicProvider } from '../../copilot/providers/anthropic';
import { openaiProvider } from '../../copilot/providers/openai';
import {
  ProviderConfig,
  loadProviderConfig,
  saveProviderConfig,
  PROVIDER_OPTIONS,
  MODEL_OPTIONS,
} from '../../copilot/providers/types';
import { ProjectMemory } from '../../copilot/memory';
import { runAgentLoop, type AgentLoopResult } from '../../copilot/agentLoop';
import { runProactiveAnalysis, formatWarnings } from '../../copilot/proactiveAnalysis';
import { isTeachingModeEnabled, setTeachingMode } from '../../copilot/teachingContext';
import './CopilotPanel.css';

const AGENT_STORAGE_KEY = 'openclo-agent-config';

// Import the PATRONAJE_SOUL as a string
const PATRONAJE_SOUL = `You are an AI pattern-making assistant inside OpenClo. You think like a patronista.
You use proper pattern-making terminology. You understand the FULL workflow: measurements → base pattern → adjustments → fitting → grading → nesting → cutting.
Default to the user's language. Spanish: use modistería terms. English: use pattern-making terms.
Expert but not condescending. Teaching mode by default — explain WHY. Proactive about issues.
Use sensible defaults: 10mm SA, grainline on center. Use emojis sparingly: 👚 bodice, 👗 skirt, 👖 pants, 🦾 sleeve, 👔 collar.`;

function loadAgentConfig(): AgentConfig {
  try {
    const saved = localStorage.getItem(AGENT_STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch { /* ignore */ }
  return { type: 'builtin', name: 'Built-in (Templates)' };
}

function saveAgentConfig(config: AgentConfig) {
  localStorage.setItem(AGENT_STORAGE_KEY, JSON.stringify(config));
}

interface CopilotPanelProps {
  isColumn?: boolean;
  onClose?: () => void;
}

/** A displayed message (extends CopilotMessage with streaming and tool call UI) */
interface DisplayMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  toolCalls?: Array<{ name: string; result?: string; success?: boolean }>;
  isStreaming?: boolean;
}

export default function CopilotPanel({ isColumn = false, onClose }: CopilotPanelProps = {}) {
  const dispatch = useDispatch<AppDispatch>();
  const project = useSelector((s: RootState) => s.project);
  const editor = useSelector((s: RootState) => s.editor);
  const rootState = useSelector((s: RootState) => s);

  const [isOpen, setIsOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Legacy agent config
  const [agentConfig, setAgentConfig] = useState<AgentConfig>(loadAgentConfig);
  const [configEndpoint, setConfigEndpoint] = useState(agentConfig.endpoint || '');

  // New provider config
  const [providerConfig, setProviderConfig] = useState<ProviderConfig | null>(loadProviderConfig);
  const [settingsProvider, setSettingsProvider] = useState<'anthropic' | 'openai'>(providerConfig?.provider || 'anthropic');
  const [settingsApiKey, setSettingsApiKey] = useState(providerConfig?.apiKey || '');
  const [settingsModel, setSettingsModel] = useState(providerConfig?.model || 'claude-sonnet-4-20250514');

  // Teaching mode
  const [teachingMode, setTeachingModeState] = useState(isTeachingModeEnabled);

  // Proactive warnings
  const [warnings, setWarnings] = useState<string>('');

  // Memory
  const memoryRef = useRef(new ProjectMemory(project.id));

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  // Update memory when project changes
  useEffect(() => {
    memoryRef.current = new ProjectMemory(project.id);
  }, [project.id]);

  // Run proactive analysis when pieces change
  useEffect(() => {
    if (project.pieces.length > 0) {
      const w = runProactiveAnalysis(project.pieces, project.seams);
      setWarnings(formatWarnings(w));
    } else {
      setWarnings('');
    }
  }, [project.pieces, project.seams]);

  /** Determine which mode we're in */
  const isProviderMode = providerConfig !== null && providerConfig.apiKey.length > 0;

  /** Send via the new LLM provider system with multi-turn agent loop */
  const handleProviderSend = useCallback(async (text: string) => {
    if (!providerConfig || !text.trim()) return;

    const userMsg: DisplayMessage = { role: 'user', content: text, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    memoryRef.current.addMessage({ role: 'user', content: text, timestamp: Date.now() });
    setInput('');
    setIsLoading(true);

    try {
      const registry = getDefaultRegistry();
      const provider = providerConfig.provider === 'anthropic' ? anthropicProvider : openaiProvider;

      // Create streaming assistant message
      const assistantMsg: DisplayMessage = {
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        toolCalls: [],
        isStreaming: true,
      };
      setMessages(prev => [...prev, assistantMsg]);

      // Run agent loop with multi-turn tool use
      const getState = () => rootState;
      const result: AgentLoopResult = await runAgentLoop(
        text,
        provider,
        providerConfig,
        registry,
        dispatch,
        getState,
        memoryRef.current,
        PATRONAJE_SOUL,
        {
          onText: (chunk) => {
            setMessages(prev => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last.role === 'assistant') {
                updated[updated.length - 1] = { ...last, content: last.content + chunk };
              }
              return updated;
            });
          },
          onToolCallStart: (name, _round) => {
            setMessages(prev => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last.role === 'assistant') {
                const tc = [...(last.toolCalls || []), { name }];
                updated[updated.length - 1] = { ...last, toolCalls: tc };
              }
              return updated;
            });
          },
          onToolCallEnd: (name, success, _round) => {
            setMessages(prev => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last.role === 'assistant' && last.toolCalls) {
                const tc = last.toolCalls.map(t =>
                  t.name === name && t.success === undefined ? { ...t, success } : t
                );
                updated[updated.length - 1] = { ...last, toolCalls: tc };
              }
              return updated;
            });
          },
          onDone: () => {
            setMessages(prev => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last.role === 'assistant') {
                let content = last.content;
                if (result.totalToolCalls > 0) {
                  content += `\n✅ ${result.totalToolCalls} action${result.totalToolCalls > 1 ? 's' : ''} applied`;
                  if (result.rounds.length > 1) {
                    content += ` (${result.rounds.length} rounds)`;
                  }
                }
                // Append teaching content if any
                if (result.teachingContent.length > 0) {
                  content += '\n\n' + result.teachingContent[0];
                }
                updated[updated.length - 1] = { ...last, content, isStreaming: false };
              }
              return updated;
            });
          },
        },
      );

      // Save to memory
      const allToolNames = result.rounds.flatMap(r => r.toolCalls.map(tc => tc.name));
      memoryRef.current.addMessage({
        role: 'assistant',
        content: result.content,
        timestamp: Date.now(),
        toolsCalled: allToolNames,
      });
      memoryRef.current.save();

    } catch (e: unknown) {
      setMessages(prev => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.role === 'assistant' && last.isStreaming) {
          updated[updated.length - 1] = {
            ...last,
            content: last.content + `\n❌ Error: ${(e as Error).message}`,
            isStreaming: false,
          };
        } else {
          updated.push({
            role: 'assistant',
            content: `❌ Error: ${(e as Error).message}`,
            timestamp: Date.now(),
          });
        }
        return updated;
      });
    } finally {
      setIsLoading(false);
    }
  }, [providerConfig, rootState, dispatch]);

  /** Send via the legacy agent connector (HTTP/WS/built-in) */
  const handleLegacySend = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMsg: DisplayMessage = { role: 'user', content: text, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const copilotMessages: CopilotMessage[] = messages
        .map(m => ({ role: m.role, content: m.content, timestamp: m.timestamp }));

      const context = buildCopilotContext(project, editor, text, copilotMessages);
      const response = await sendToAgent(agentConfig, context);
      const { executed, errors } = executeCommands(response.commands, dispatch, project.pieces);

      let content = response.message;
      if (errors.length > 0) content += `\n⚠️ ${errors.join(', ')}`;
      if (executed > 0) content += `\n✅ ${executed} action${executed > 1 ? 's' : ''} applied`;

      setMessages(prev => [...prev, { role: 'assistant', content, timestamp: Date.now() }]);
    } catch (e: unknown) {
      setMessages(prev => [...prev, { role: 'assistant', content: `❌ ${(e as Error).message}`, timestamp: Date.now() }]);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, project, editor, messages, agentConfig, dispatch]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    if (isProviderMode) {
      await handleProviderSend(text);
    } else {
      await handleLegacySend(text);
    }
  }, [input, isLoading, isProviderMode, handleProviderSend, handleLegacySend]);

  const handleSendText = useCallback(async (text: string) => {
    if (isProviderMode) {
      await handleProviderSend(text);
    } else {
      await handleLegacySend(text);
    }
  }, [isProviderMode, handleProviderSend, handleLegacySend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSaveSettings = () => {
    // Save provider config
    if (settingsApiKey.trim()) {
      const config: ProviderConfig = {
        provider: settingsProvider as 'anthropic' | 'openai',
        apiKey: settingsApiKey,
        model: settingsModel,
      };
      setProviderConfig(config);
      saveProviderConfig(config);
      // Also set agent config for display
      const label = PROVIDER_OPTIONS.find(p => p.value === settingsProvider)?.label || settingsProvider;
      setAgentConfig({ type: 'builtin', name: label });
    } else if (configEndpoint.trim()) {
      // Legacy endpoint mode
      let newConfig: AgentConfig;
      if (configEndpoint.startsWith('ws://') || configEndpoint.startsWith('wss://')) {
        newConfig = { type: 'websocket', endpoint: configEndpoint, name: 'WebSocket Agent' };
      } else {
        newConfig = { type: 'http', endpoint: configEndpoint, name: 'HTTP Agent' };
      }
      setAgentConfig(newConfig);
      saveAgentConfig(newConfig);
      setProviderConfig(null);
    } else {
      setAgentConfig({ type: 'builtin', name: 'Built-in (Templates)' });
      saveAgentConfig({ type: 'builtin', name: 'Built-in (Templates)' });
      setProviderConfig(null);
    }
    setShowSettings(false);
  };

  const hasConnection = isProviderMode || agentConfig.type !== 'builtin';

  // For non-column mode (legacy floating), return the old behavior
  if (!isColumn) {
    if (!isOpen) {
      return (
        <button
          className="copilot-toggle"
          onClick={() => setIsOpen(true)}
          title="Chat (Ctrl+K)"
        >
          <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
            <path d="M3 3H13C13.55 3 14 3.45 14 4V10C14 10.55 13.55 11 13 11H5L2 14V4C2 3.45 2.45 3 3 3Z" stroke="currentColor" strokeWidth="1.2" fill="none"/>
          </svg>
        </button>
      );
    }
  }

  return (
    <div className={`copilot-panel ${isColumn ? 'column-mode' : ''} ${isFullscreen ? 'fullscreen' : ''}`}>
      <div className="copilot-header">
        <div className="copilot-title">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 3H13C13.55 3 14 3.45 14 4V10C14 10.55 13.55 11 13 11H5L2 14V4C2 3.45 2.45 3 3 3Z" fill="var(--accent)" stroke="var(--accent)" strokeWidth="1"/>
          </svg>
          <span>Chat</span>
          {hasConnection && <span className="copilot-agent-badge">
            {isProviderMode ? `${settingsProvider} / ${settingsModel.split('-').slice(0, 2).join('-')}` : agentConfig.name}
          </span>}
        </div>
        <div className="copilot-header-actions">
          {isColumn && (
            <button
              className="copilot-btn-sm"
              onClick={() => setIsFullscreen(!isFullscreen)}
              title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                {isFullscreen ? (
                  <path d="M4 2V4H2M10 2V4H8M8 10V8H10M2 10V8H4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                ) : (
                  <path d="M2 4V2H4M8 2H10V4M10 8V10H8M4 10H2V8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                )}
              </svg>
            </button>
          )}
          <button className="copilot-btn-sm" onClick={() => setShowSettings(!showSettings)} title="Settings">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M6 7.5A1.5 1.5 0 1 0 6 4.5A1.5 1.5 0 0 0 6 7.5Z" stroke="currentColor" strokeWidth="1" fill="none"/>
              <path d="M9.73 7.27A.75.75 0 0 0 9.8 6.6L10.85 5.55A.75.75 0 0 0 10.85 4.45L9.8 3.4A.75.75 0 0 0 9.73 2.73L8.68 2.18A.75.75 0 0 0 7.82 2.27L6.77 2.82A.75.75 0 0 0 6.23 2.82L5.18 2.27A.75.75 0 0 0 4.32 2.18L3.27 2.73A.75.75 0 0 0 3.2 3.4L2.15 4.45A.75.75 0 0 0 2.15 5.55L3.2 6.6A.75.75 0 0 0 3.27 7.27L4.32 7.82A.75.75 0 0 0 5.18 7.73L6.23 7.18A.75.75 0 0 0 6.77 7.18L7.82 7.73A.75.75 0 0 0 8.68 7.82L9.73 7.27Z" stroke="currentColor" strokeWidth="1" fill="none"/>
            </svg>
          </button>
          <button className="copilot-btn-sm" onClick={() => setMessages([])} title="Clear chat">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 3H10M4 3V2H8V3M3 3V10C3 10.5 3.5 11 4 11H8C8.5 11 9 10.5 9 10V3" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
            </svg>
          </button>
          <button
            className="copilot-btn-sm"
            onClick={isColumn ? onClose : () => setIsOpen(false)}
            title="Close"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M3 3L9 9M9 3L3 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      </div>

      {showSettings && (
        <div className="copilot-settings">
          <h4>AI Provider</h4>
          <p className="settings-hint">
            Connect an AI provider for intelligent pattern assistance, or use built-in templates.
          </p>

          {/* Provider selection */}
          <div className="settings-field">
            <label>Provider</label>
            <select
              className="settings-input"
              value={settingsProvider}
              onChange={e => {
                setSettingsProvider(e.target.value as 'anthropic' | 'openai');
                const opt = PROVIDER_OPTIONS.find(p => p.value === e.target.value);
                if (opt) setSettingsModel(opt.defaultModel);
              }}
            >
              {PROVIDER_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* API Key */}
          <div className="settings-field">
            <label>API Key</label>
            <input
              type="password"
              placeholder="sk-..."
              value={settingsApiKey}
              onChange={e => setSettingsApiKey(e.target.value)}
              className="settings-input"
            />
          </div>

          {/* Model */}
          <div className="settings-field">
            <label>Model</label>
            <select
              className="settings-input"
              value={settingsModel}
              onChange={e => setSettingsModel(e.target.value)}
            >
              {(MODEL_OPTIONS[settingsProvider] || []).map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* Teaching mode toggle */}
          <div className="settings-field" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ flex: 1 }}>Teaching Mode</label>
            <input
              type="checkbox"
              checked={teachingMode}
              onChange={e => {
                setTeachingModeState(e.target.checked);
                setTeachingMode(e.target.checked);
              }}
            />
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
              {teachingMode ? 'ON — explains why' : 'OFF'}
            </span>
          </div>

          {/* Legacy endpoint (collapsible) */}
          <details style={{ marginTop: 8 }}>
            <summary style={{ fontSize: 10, color: 'var(--text-muted)', cursor: 'pointer' }}>
              Custom agent endpoint (advanced)
            </summary>
            <div className="settings-field" style={{ marginTop: 6 }}>
              <label>Agent Endpoint</label>
              <input
                type="text"
                placeholder="http://localhost:3001/copilot"
                value={configEndpoint}
                onChange={e => setConfigEndpoint(e.target.value)}
                className="settings-input"
              />
            </div>
          </details>

          <button className="settings-save" onClick={handleSaveSettings} style={{ marginTop: 8 }}>Save</button>
        </div>
      )}

      {/* Proactive analysis warnings */}
      {warnings && (
        <div style={{
          padding: '6px 10px',
          fontSize: 10,
          lineHeight: 1.4,
          background: 'var(--bg-warning, rgba(255,200,0,0.08))',
          borderBottom: '1px solid var(--border)',
          whiteSpace: 'pre-line',
          maxHeight: 80,
          overflow: 'auto',
        }}>
          {warnings}
        </div>
      )}

      <div className="copilot-messages">
        {messages.length === 0 && !hasConnection && (
          <div className="copilot-empty">
            <svg className="copilot-empty-icon" width="40" height="40" viewBox="0 0 16 16" fill="none">
              <path d="M3 3H13C13.55 3 14 3.45 14 4V10C14 10.55 13.55 11 13 11H5L2 14V4C2 3.45 2.45 3 3 3Z" stroke="var(--text-muted)" strokeWidth="0.8" fill="none"/>
            </svg>
            <p className="copilot-empty-title">Connect an AI provider</p>
            <p className="copilot-empty-hint">
              Add your Anthropic or OpenAI API key to get AI-powered pattern assistance.
              Or use built-in templates for quick pattern blocks.
            </p>
            <button className="copilot-setup-btn" onClick={() => setShowSettings(true)}>
              <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
                <path d="M6 7.5A1.5 1.5 0 1 0 6 4.5A1.5 1.5 0 0 0 6 7.5Z" stroke="currentColor" strokeWidth="1" fill="none"/>
              </svg>
              Configure Provider
            </button>
          </div>
        )}
        {messages.length === 0 && hasConnection && (
          <div className="copilot-empty">
            <p>Connected to <strong>{isProviderMode ? `${settingsProvider}` : agentConfig.name}</strong></p>
            <p className="copilot-empty-hint">Ask anything about your patterns:</p>
            <div className="copilot-suggestions">
              {['Hazme un corpiño talla 40', 'Generate a bodice block', 'Create a sleeve', 'Revisa los márgenes de costura'].map(s => (
                <button key={s} className="copilot-suggestion" onClick={() => handleSendText(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`copilot-msg ${msg.role}`}>
            <div className="copilot-msg-content">
              {msg.content}
              {msg.toolCalls && msg.toolCalls.length > 0 && (
                <div style={{ marginTop: 6, fontSize: 10, opacity: 0.7 }}>
                  {msg.toolCalls.map((tc, j) => (
                    <div key={j}>
                      {tc.success === undefined ? '⏳' : tc.success ? '🔧' : '❌'} {tc.name}
                      {tc.result && <span style={{ opacity: 0.6 }}> → {tc.result.slice(0, 80)}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="copilot-msg assistant">
            <div className="copilot-msg-content copilot-loading">
              <span className="dot">●</span>
              <span className="dot">●</span>
              <span className="dot">●</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="copilot-input-area">
        <input
          ref={inputRef}
          type="text"
          className="copilot-input"
          placeholder={hasConnection ? "Type a message..." : "Connect a provider in Settings..."}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
        />
        <button
          className="copilot-send"
          onClick={handleSend}
          disabled={!input.trim() || isLoading}
        >
          →
        </button>
      </div>
    </div>
  );
}
