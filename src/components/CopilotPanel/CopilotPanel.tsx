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
import { runProactiveAnalysis, formatWarnings } from '../../copilot/proactiveAnalysis';
import { isTeachingModeEnabled } from '../../copilot/teachingContext';
import { CostManager } from '../../copilot/costManager';
import { RecoveryStrategy, getErrorMessage, classifyError, isOfflineMode, getOfflineActions } from '../../copilot/errorRecovery';
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
const QUICK_ACTIONS = [
  { label: 'Nuevo corpiño', text: 'Crear un corpiño base talla 40' },
  { label: 'Agregar manga', text: 'Agregar manga al corpiño' },
  { label: 'Gradar', text: 'Gradar todas las tallas' },
  { label: 'Anidar', text: 'Anidar las piezas en tela' },
  { label: 'Exportar DXF', text: 'Exportar proyecto como DXF' },
];

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

  // Proactive warnings
  const [warnings, setWarnings] = useState<string>('');

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

  // Run proactive analysis when pieces change
  useEffect(() => {
    if (project.pieces.length > 0) {
      const w = runProactiveAnalysis(project.pieces, project.seams);
      setWarnings(formatWarnings(w));
    } else {
      setWarnings('');
    }
  }, [project.pieces, project.seams]);

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
          <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
            <path d="M3 3H13C13.55 3 14 3.45 14 4V10C14 10.55 13.55 11 13 11H5L2 14V4C2 3.45 2.45 3 3 3Z" stroke="currentColor" strokeWidth="1.2" fill="none"/>
          </svg>
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
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 3H13C13.55 3 14 3.45 14 4V10C14 10.55 13.55 11 13 11H5L2 14V4C2 3.45 2.45 3 3 3Z" fill="var(--accent)" stroke="var(--accent)" strokeWidth="1"/>
          </svg>
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
          <button className="copilot-btn-sm" onClick={handleClearConversation} title="Clear chat">
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

      {/* Proactive analysis warnings */}
      {warnings && !showSettings && (
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
            <p className="copilot-empty-title">AI Pattern Assistant</p>
            <p className="copilot-empty-hint">
              Configure an AI provider to get started — or use quick actions below without AI.
            </p>
            <button className="copilot-setup-btn" onClick={() => setShowSettings(true)}>
              <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
                <path d="M6 7.5A1.5 1.5 0 1 0 6 4.5A1.5 1.5 0 0 0 6 7.5Z" stroke="currentColor" strokeWidth="1" fill="none"/>
              </svg>
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
          {QUICK_ACTIONS.map(qa => (
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
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 1C5.9 1 5 1.9 5 3V7C5 8.1 5.9 9 7 9C8.1 9 9 8.1 9 7V3C9 1.9 8.1 1 7 1Z" fill={isListening ? 'var(--accent)' : 'none'} stroke="currentColor" strokeWidth="1"/>
              <path d="M3 6V7C3 9.2 4.8 11 7 11C9.2 11 11 9.2 11 7V6" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
              <path d="M7 11V13" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
            </svg>
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
