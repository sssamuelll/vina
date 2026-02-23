import { MessageSquare, Maximize2, Minimize2, Settings, Trash2, X, Mic } from 'lucide-react';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '../../store';
import { AgentConfig, CopilotMessage, buildCopilotContext } from '../../copilot/protocol';
import { sendToAgent } from '../../copilot/agentConnector';
import { executeCommands } from '../../copilot/commandExecutor';
import { getDefaultRegistry } from '../../copilot/tools/registry';
import { anthropicProvider } from '../../copilot/providers/anthropic';
import { openaiProvider } from '../../copilot/providers/openai';
import { ollamaProvider } from '../../copilot/providers/ollama';
import {
  ProviderConfig,
  loadProviderConfig,
  PROVIDER_OPTIONS,
} from '../../copilot/providers/types';
import { ProjectMemory } from '../../copilot/memory';
import { runAgentLoop, type AgentLoopResult } from '../../copilot/agentLoop';
// Proactive analysis moved to BottomPanel Problems tab
import { isTeachingModeEnabled } from '../../copilot/teachingContext';
import { CostManager } from '../../copilot/costManager';
import { RecoveryStrategy, getErrorMessage, classifyError, isOfflineMode, getOfflineActions } from '../../copilot/errorRecovery';
import { type AgentLanguage } from '../../copilot/languageDetection';
import { loadLanguagePreference } from '../../copilot/AgentSettings';
import AgentSettings from '../../copilot/AgentSettings';
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

/** Quick action chips for mobile */
const QUICK_ACTIONS: Record<AgentLanguage, Array<{ label: string; text: string }>> = {
  es: [
    { label: 'Nuevo corpiño', text: 'Crear un corpiño base talla 40' },
    { label: 'Agregar manga', text: 'Agregar manga al corpiño' },
    { label: 'Gradar', text: 'Gradar todas las tallas' },
    { label: 'Anidar', text: 'Anidar las piezas en tela' },
    { label: 'Exportar DXF', text: 'Exportar proyecto como DXF' },
  ],
  en: [
    { label: 'New bodice', text: 'Create a basic bodice block size 40' },
    { label: 'Add sleeve', text: 'Add sleeve to the bodice' },
    { label: 'Grade', text: 'Grade all sizes' },
    { label: 'Nest', text: 'Nest the pieces on fabric' },
    { label: 'Export DXF', text: 'Export project as DXF' },
  ],
};

/** Get localized quick actions based on language preference */
function getLocalizedQuickActions(): Array<{ label: string; text: string }> {
  const langPref = loadLanguagePreference();
  if (langPref === 'es' || langPref === 'en') {
    return QUICK_ACTIONS[langPref];
  }
  // For 'auto', detect based on the first message if available, otherwise default to Spanish
  return QUICK_ACTIONS.es;
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

/** Get the right provider instance based on config */
function getProvider(config: ProviderConfig) {
  switch (config.provider) {
    case 'anthropic': return anthropicProvider;
    case 'openai': return openaiProvider;
    case 'ollama': return ollamaProvider;
    default: return anthropicProvider;
  }
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

  // New provider config
  const [providerConfig, setProviderConfig] = useState<ProviderConfig | null>(loadProviderConfig);

  // Teaching mode (managed by AgentSettings)
  useState(isTeachingModeEnabled);

  // Proactive warnings (moved to BottomPanel Problems tab)

  // Cost management
  const costManagerRef = useRef(new CostManager(project.id));
  const [sessionCostLabel, setSessionCostLabel] = useState('');

  // Recovery strategy
  const recoveryRef = useRef(new RecoveryStrategy());

  // Voice input (SpeechRecognition is not available in all browsers)
  const [isListening, setIsListening] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  // Mobile detection
  const [isMobile, setIsMobile] = useState(false);

  // Swipe handling
  const touchStartRef = useRef<{ y: number; time: number } | null>(null);

  // Expanded tool calls (mobile compact view)
  const [expandedTools, setExpandedTools] = useState<Set<number>>(new Set());

  // Memory
  const memoryRef = useRef(new ProjectMemory(project.id));

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Detect mobile
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  // Update memory and cost manager when project changes
  useEffect(() => {
    memoryRef.current = new ProjectMemory(project.id);
    costManagerRef.current = new CostManager(project.id);
  }, [project.id]);

  // Proactive analysis moved to BottomPanel Problems tab (VS Code style)

  // Voice input setup (Web Speech API — not available in all browsers)
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SpeechRecognitionAPI = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (SpeechRecognitionAPI) {
      const recognition = new SpeechRecognitionAPI();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'es-ES'; // Default to Spanish, auto-adjusts
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recognition.onresult = (event: any) => {
        const transcript = event.results?.[0]?.[0]?.transcript;
        if (transcript) {
          setInput(transcript);
        }
        setIsListening(false);
      };
      recognition.onerror = () => setIsListening(false);
      recognition.onend = () => setIsListening(false);
      recognitionRef.current = recognition;
    }
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  /** Determine which mode we're in */
  const isProviderMode = providerConfig !== null && (
    providerConfig.provider === 'ollama' || providerConfig.apiKey.length > 0
  );
  const offline = isOfflineMode(providerConfig);

  /** Send via the new LLM provider system with multi-turn agent loop */
  const handleProviderSend = useCallback(async (text: string) => {
    if (!providerConfig || !text.trim()) return;

    const userMsg: DisplayMessage = { role: 'user', content: text, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    memoryRef.current.addMessage({ role: 'user', content: text, timestamp: Date.now() });
    setInput('');
    setIsLoading(true);

    // Haptic feedback on mobile
    if (isMobile && navigator.vibrate) {
      navigator.vibrate(30);
    }

    try {
      const registry = getDefaultRegistry();
      const provider = getProvider(providerConfig);

      // Create streaming assistant message
      const assistantMsg: DisplayMessage = {
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        toolCalls: [],
        isStreaming: true,
      };
      setMessages(prev => [...prev, assistantMsg]);

      // Run agent loop with multi-turn tool use (wrapped in recovery)
      const getState = () => rootState;
      const result: AgentLoopResult = await recoveryRef.current.withRecovery(() =>
        runAgentLoop(
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
              // Haptic on tool execution
              if (isMobile && navigator.vibrate) {
                navigator.vibrate(15);
              }
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
        )
      );

      // Track cost
      // Note: usage comes from the provider response; we estimate if unavailable
      const totalRoundCalls = result.rounds.reduce((sum, r) => sum + r.toolCalls.length, 0);
      const estimatedInput = result.content.length * 4; // rough estimate: 4 chars per token
      const estimatedOutput = result.content.length;
      costManagerRef.current.trackUsage(
        providerConfig.provider,
        estimatedInput,
        estimatedOutput,
        providerConfig.model,
      );
      setSessionCostLabel(costManagerRef.current.formatSessionCost());

      // Save to memory
      const allToolNames = result.rounds.flatMap(r => r.toolCalls.map(tc => tc.name));
      memoryRef.current.addMessage({
        role: 'assistant',
        content: result.content,
        timestamp: Date.now(),
        toolsCalled: allToolNames,
      });
      memoryRef.current.save();

      // Budget warning
      if (costManagerRef.current.shouldWarn()) {
        const warning = costManagerRef.current.getBudgetWarning();
        if (warning) {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: warning,
            timestamp: Date.now(),
          }]);
        }
      }

      // Suppress lint: used for cost tracking total tool calls info
      void totalRoundCalls;

    } catch (e: unknown) {
      const errorType = classifyError(e);
      const errorMsg = getErrorMessage(errorType, e);
      setMessages(prev => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.role === 'assistant' && last.isStreaming) {
          updated[updated.length - 1] = {
            ...last,
            content: last.content + `\n${errorMsg}`,
            isStreaming: false,
          };
        } else {
          updated.push({
            role: 'assistant',
            content: errorMsg,
            timestamp: Date.now(),
          });
        }
        return updated;
      });
    } finally {
      setIsLoading(false);
    }
  }, [providerConfig, rootState, dispatch, isMobile]);

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

  /** Handle saving from the new AgentSettings panel */
  const handleSettingsSave = useCallback((config: ProviderConfig | null) => {
    setProviderConfig(config);
    if (config) {
      const label = PROVIDER_OPTIONS.find(p => p.value === config.provider)?.label || config.provider;
      setAgentConfig({ type: 'builtin', name: label });
    } else {
      setAgentConfig({ type: 'builtin', name: 'Built-in (Templates)' });
      saveAgentConfig({ type: 'builtin', name: 'Built-in (Templates)' });
    }
  }, []);

  const handleClearConversation = useCallback(() => {
    setMessages([]);
    costManagerRef.current.resetSession();
    setSessionCostLabel('');
  }, []);

  const handleClearMemory = useCallback(() => {
    memoryRef.current.clear();
    memoryRef.current.save();
  }, []);

  const handleBudgetChange = useCallback((budget: number) => {
    costManagerRef.current.setBudget(budget);
  }, []);

  /** Toggle voice input */
  const handleVoiceToggle = useCallback(() => {
    if (!recognitionRef.current) return;
    if (isListening) {
      recognitionRef.current.abort();
      setIsListening(false);
    } else {
      recognitionRef.current.start();
      setIsListening(true);
    }
  }, [isListening]);

  /** Swipe down to minimize (mobile) */
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!isMobile) return;
    touchStartRef.current = { y: e.touches[0].clientY, time: Date.now() };
  }, [isMobile]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!isMobile || !touchStartRef.current) return;
    const deltaY = e.changedTouches[0].clientY - touchStartRef.current.y;
    const deltaTime = Date.now() - touchStartRef.current.time;
    // Swipe down gesture (fast, >100px)
    if (deltaY > 100 && deltaTime < 300 && isFullscreen) {
      setIsFullscreen(false);
    }
    touchStartRef.current = null;
  }, [isMobile, isFullscreen]);

  const hasConnection = isProviderMode || agentConfig.type !== 'builtin';

  // Provider display name
  const providerLabel = providerConfig ? (
    `${providerConfig.provider} / ${providerConfig.model.split('-').slice(0, 2).join('-')}`
  ) : agentConfig.name;

  // For non-column mode (legacy floating), return the old behavior
  if (!isColumn) {
    if (!isOpen) {
      return (
        <button
          className="copilot-toggle"
          onClick={() => setIsOpen(true)}
          title="Chat (Ctrl+K)"
        >
          <MessageSquare size={20} />
        </button>
      );
    }
  }

  // Offline quick actions
  const offlineActions = getOfflineActions();

  return (
    <div
      className={`copilot-panel ${isColumn ? 'column-mode' : ''} ${isFullscreen ? 'fullscreen' : ''} ${isMobile ? 'mobile' : ''}`}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="copilot-header">
        <div className="copilot-title">
          <MessageSquare size={16} style={{ color: 'var(--accent)' }} />
          <span>Chat</span>
          {hasConnection && <span className="copilot-agent-badge">{providerLabel}</span>}
          {offline && <span className="copilot-agent-badge" style={{ color: '#ff9800' }}>Offline</span>}
        </div>
        <div className="copilot-header-actions">
          {isColumn && (
            <button
              className="copilot-btn-sm"
              onClick={() => setIsFullscreen(!isFullscreen)}
              title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
            </button>
          )}
          <button className="copilot-btn-sm" onClick={() => setShowSettings(!showSettings)} title="Settings">
            <Settings size={12} />
          </button>
          <button className="copilot-btn-sm" onClick={handleClearConversation} title="Clear chat">
            <Trash2 size={12} />
          </button>
          <button
            className="copilot-btn-sm"
            onClick={isColumn ? onClose : () => setIsOpen(false)}
            title="Close"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {showSettings && (
        <AgentSettings
          onSave={handleSettingsSave}
          onClose={() => setShowSettings(false)}
          onClearConversation={handleClearConversation}
          onClearMemory={handleClearMemory}
          sessionCost={costManagerRef.current.getSessionCost()}
          projectCost={costManagerRef.current.getProjectCost()}
          budget={costManagerRef.current.getBudget()}
          onBudgetChange={handleBudgetChange}
        />
      )}

      {/* Proactive analysis warnings moved to BottomPanel → Problems tab */}

      <div className="copilot-messages">
        {messages.length === 0 && !hasConnection && (
          <div className="copilot-empty">
            <MessageSquare className="copilot-empty-icon" size={40} style={{ color: 'var(--text-muted)' }} />
            <p className="copilot-empty-title">AI Pattern Assistant</p>
            <p className="copilot-empty-hint">
              Configure an AI provider to get started — or use quick actions below without AI.
            </p>
            <button className="copilot-setup-btn" onClick={() => setShowSettings(true)}>
              <Settings size={14} />
              Configure Provider
            </button>
            <div className="copilot-suggestions" style={{ marginTop: 12 }}>
              {offlineActions.slice(0, 6).map(a => (
                <button key={a.toolName + a.label} className="copilot-suggestion" onClick={() => handleSendText(a.label.split(' / ')[0])}>
                  {a.icon} {a.label.split(' / ')[0]}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.length === 0 && hasConnection && (
          <div className="copilot-empty">
            <p>Connected to <strong>{providerLabel}</strong></p>
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
                <div
                  className={`copilot-tool-calls ${isMobile ? 'compact' : ''}`}
                  onClick={() => {
                    if (isMobile) {
                      setExpandedTools(prev => {
                        const next = new Set(prev);
                        if (next.has(i)) next.delete(i); else next.add(i);
                        return next;
                      });
                    }
                  }}
                >
                  {isMobile && !expandedTools.has(i) ? (
                    <div className="copilot-tool-compact">
                      {msg.toolCalls.every(tc => tc.success) ? '🔧' : '⚠️'}{' '}
                      {msg.toolCalls.length} tool{msg.toolCalls.length > 1 ? 's' : ''} ▸
                    </div>
                  ) : (
                    msg.toolCalls.map((tc, j) => (
                      <div key={j}>
                        {tc.success === undefined ? '⏳' : tc.success ? '🔧' : '❌'} {tc.name}
                        {tc.result && !isMobile && <span style={{ opacity: 0.6 }}> → {tc.result.slice(0, 80)}</span>}
                      </div>
                    ))
                  )}
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

      {/* Mobile quick action chips */}
      {isMobile && hasConnection && !showSettings && (
        <div className="copilot-quick-actions">
          {getLocalizedQuickActions().map(qa => (
            <button
              key={qa.label}
              className="copilot-quick-chip"
              onClick={() => handleSendText(qa.text)}
              disabled={isLoading}
            >
              {qa.label}
            </button>
          ))}
        </div>
      )}

      {/* Footer with cost display */}
      {sessionCostLabel && !showSettings && (
        <div className="copilot-cost-footer">
          {sessionCostLabel}
        </div>
      )}

      <div className="copilot-input-area">
        {/* Voice input button (mobile) */}
        {recognitionRef.current && (
          <button
            className={`copilot-btn-sm copilot-voice-btn ${isListening ? 'listening' : ''}`}
            onClick={handleVoiceToggle}
            title="Voice input"
          >
            <Mic size={14} style={isListening ? { color: 'var(--accent)' } : undefined} />
          </button>
        )}
        <input
          ref={inputRef}
          type="text"
          className="copilot-input"
          placeholder={hasConnection ? "Type a message..." : offline ? "Quick action or connect provider..." : "Connect a provider in Settings..."}
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
