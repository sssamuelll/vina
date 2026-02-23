import { MessageSquare } from 'lucide-react';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '../../store';
import { AgentConfig, CopilotMessage, buildCopilotContext } from '../../copilot/protocol';
import { sendToAgent } from '../../copilot/agentConnector';
import { executeCommands } from '../../copilot/commandExecutor';
import { getDefaultRegistry } from '../../copilot/tools/registry';
import { anthropicProvider } from '../../copilot/providers/anthropic';
import { openaiProvider } from '../../copilot/providers/openai';
import { deepseekProvider } from '../../copilot/providers/deepseek';
import { ollamaProvider } from '../../copilot/providers/ollama';
import { claudeBridgeProvider } from '../../copilot/providers/claudeBridge';
import {
  ProviderConfig,
  loadProviderConfig,
  PROVIDER_OPTIONS,
} from '../../copilot/providers/types';
import { ProjectMemory } from '../../copilot/memory';
import { runAgentLoop, type AgentLoopResult } from '../../copilot/agentLoop';
import { isTeachingModeEnabled } from '../../copilot/teachingContext';
import { CostManager } from '../../copilot/costManager';
import { RecoveryStrategy, getErrorMessage, classifyError, isOfflineMode } from '../../copilot/errorRecovery';
import AgentSettings from '../../copilot/AgentSettings';
import CopilotHeader from './CopilotHeader';
import CopilotMessages, { DisplayMessage } from './CopilotMessages';
import CopilotInput from './CopilotInput';
import './CopilotPanel.css';

const AGENT_STORAGE_KEY = 'openclo-agent-config';

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
  import('../../utils/storage').then(({ storageSet }) => { storageSet('settings', 'agent-config', config); });
  try { localStorage.setItem(AGENT_STORAGE_KEY, JSON.stringify(config)); } catch { /* ignore */ }
}

function getProvider(config: ProviderConfig) {
  switch (config.provider) {
    case 'claude-bridge': return claudeBridgeProvider;
    case 'anthropic': return anthropicProvider;
    case 'openai': return openaiProvider;
    case 'deepseek': return deepseekProvider;
    case 'ollama': return ollamaProvider;
    default: return anthropicProvider;
  }
}

interface CopilotPanelProps {
  isColumn?: boolean;
  onClose?: () => void;
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
  const [agentConfig, setAgentConfig] = useState<AgentConfig>(loadAgentConfig);
  const [providerConfig, setProviderConfig] = useState<ProviderConfig | null>(loadProviderConfig);
  const [isMobile, setIsMobile] = useState(false);
  const [expandedTools, setExpandedTools] = useState<Set<number>>(new Set());
  const [sessionCostLabel, setSessionCostLabel] = useState('');

  // Teaching mode (managed by AgentSettings)
  useState(isTeachingModeEnabled);

  const costManagerRef = useRef(new CostManager(project.id));
  const recoveryRef = useRef(new RecoveryStrategy());
  const memoryRef = useRef(new ProjectMemory(project.id));
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<{ y: number; time: number } | null>(null);

  // Listen for external settings toggle (from CopilotSidePanel)
  useEffect(() => {
    const handler = () => setShowSettings(prev => !prev);
    window.addEventListener('openclo:copilot-settings', handler);
    return () => window.removeEventListener('openclo:copilot-settings', handler);
  }, []);

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
    memoryRef.current = new ProjectMemory(project.id);
    costManagerRef.current = new CostManager(project.id);
  }, [project.id]);

  const isProviderMode = providerConfig !== null && (
    providerConfig.provider === 'ollama' || providerConfig.provider === 'claude-bridge' || providerConfig.apiKey.length > 0
  );
  const offline = isOfflineMode(providerConfig);
  const hasConnection = isProviderMode || agentConfig.type !== 'builtin';
  const providerLabel = providerConfig ? (
    `${providerConfig.provider} / ${providerConfig.model.split('-').slice(0, 2).join('-')}`
  ) : agentConfig.name;

  /** Send via the new LLM provider system with multi-turn agent loop */
  const handleProviderSend = useCallback(async (text: string) => {
    if (!providerConfig || !text.trim()) return;

    const userMsg: DisplayMessage = { role: 'user', content: text, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    memoryRef.current.addMessage({ role: 'user', content: text, timestamp: Date.now() });
    setInput('');
    setIsLoading(true);

    if (isMobile && navigator.vibrate) navigator.vibrate(30);

    try {
      const registry = getDefaultRegistry();
      const provider = getProvider(providerConfig);

      const assistantMsg: DisplayMessage = {
        role: 'assistant', content: '', timestamp: Date.now(), toolCalls: [], isStreaming: true,
      };
      setMessages(prev => [...prev, assistantMsg]);

      const getState = () => rootState;
      const result: AgentLoopResult = await recoveryRef.current.withRecovery(() =>
        runAgentLoop(
          text, provider, providerConfig, registry, dispatch, getState, memoryRef.current, PATRONAJE_SOUL,
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
              if (isMobile && navigator.vibrate) navigator.vibrate(15);
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
                    if (result.rounds.length > 1) content += ` (${result.rounds.length} rounds)`;
                  }
                  if (result.teachingContent.length > 0) content += '\n\n' + result.teachingContent[0];
                  updated[updated.length - 1] = { ...last, content, isStreaming: false };
                }
                return updated;
              });
            },
          },
        )
      );

      const totalRoundCalls = result.rounds.reduce((sum, r) => sum + r.toolCalls.length, 0);
      const estimatedInput = result.content.length * 4;
      const estimatedOutput = result.content.length;
      costManagerRef.current.trackUsage(providerConfig.provider, estimatedInput, estimatedOutput, providerConfig.model);
      setSessionCostLabel(costManagerRef.current.formatSessionCost());

      const allToolNames = result.rounds.flatMap(r => r.toolCalls.map(tc => tc.name));
      memoryRef.current.addMessage({ role: 'assistant', content: result.content, timestamp: Date.now(), toolsCalled: allToolNames });
      memoryRef.current.save();

      if (costManagerRef.current.shouldWarn()) {
        const warning = costManagerRef.current.getBudgetWarning();
        if (warning) setMessages(prev => [...prev, { role: 'assistant', content: warning, timestamp: Date.now() }]);
      }

      void totalRoundCalls;
    } catch (e: unknown) {
      const errorType = classifyError(e);
      const errorMsg = getErrorMessage(errorType, e);
      setMessages(prev => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.role === 'assistant' && last.isStreaming) {
          updated[updated.length - 1] = { ...last, content: last.content + `\n${errorMsg}`, isStreaming: false };
        } else {
          updated.push({ role: 'assistant', content: errorMsg, timestamp: Date.now() });
        }
        return updated;
      });
    } finally {
      setIsLoading(false);
    }
  }, [providerConfig, rootState, dispatch, isMobile]);

  const handleLegacySend = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;
    const userMsg: DisplayMessage = { role: 'user', content: text, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);
    try {
      const copilotMessages: CopilotMessage[] = messages.map(m => ({ role: m.role, content: m.content, timestamp: m.timestamp }));
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
    if (isProviderMode) await handleProviderSend(text);
    else await handleLegacySend(text);
  }, [input, isLoading, isProviderMode, handleProviderSend, handleLegacySend]);

  const handleSendText = useCallback(async (text: string) => {
    if (isProviderMode) await handleProviderSend(text);
    else await handleLegacySend(text);
  }, [isProviderMode, handleProviderSend, handleLegacySend]);

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

  const handleToggleExpandTool = useCallback((index: number) => {
    setExpandedTools(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index); else next.add(index);
      return next;
    });
  }, []);

  // Swipe handling
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!isMobile) return;
    touchStartRef.current = { y: e.touches[0].clientY, time: Date.now() };
  }, [isMobile]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!isMobile || !touchStartRef.current) return;
    const deltaY = e.changedTouches[0].clientY - touchStartRef.current.y;
    const deltaTime = Date.now() - touchStartRef.current.time;
    if (deltaY > 100 && deltaTime < 300 && isFullscreen) setIsFullscreen(false);
    touchStartRef.current = null;
  }, [isMobile, isFullscreen]);

  // For non-column mode (legacy floating)
  if (!isColumn) {
    if (!isOpen) {
      return (
        <button className="copilot-toggle" onClick={() => setIsOpen(true)} title="Chat (Ctrl+K)">
          <MessageSquare size={20} />
        </button>
      );
    }
  }

  return (
    <div
      className={`copilot-panel ${isColumn ? 'column-mode' : ''} ${isFullscreen ? 'fullscreen' : ''} ${isMobile ? 'mobile' : ''}`}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <CopilotHeader
        hasConnection={hasConnection}
        providerLabel={providerLabel}
        offline={offline}
        isColumn={isColumn}
        isFullscreen={isFullscreen}
        showSettings={showSettings}
        onToggleFullscreen={() => setIsFullscreen(!isFullscreen)}
        onToggleSettings={() => setShowSettings(!showSettings)}
        onClearConversation={handleClearConversation}
        onClose={isColumn ? (onClose || (() => {})) : () => setIsOpen(false)}
      />

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

      <CopilotMessages
        ref={messagesEndRef}
        messages={messages}
        isLoading={isLoading}
        hasConnection={hasConnection}
        providerLabel={providerLabel}
        isMobile={isMobile}
        expandedTools={expandedTools}
        onToggleExpandTool={handleToggleExpandTool}
        onOpenSettings={() => setShowSettings(true)}
        onSendText={handleSendText}
      />

      <CopilotInput
        input={input}
        isLoading={isLoading}
        isOpen={isOpen || isColumn}
        hasConnection={hasConnection}
        offline={offline}
        isMobile={isMobile}
        showSettings={showSettings}
        sessionCostLabel={sessionCostLabel}
        onInputChange={setInput}
        onSend={handleSend}
        onSendText={handleSendText}
      />
    </div>
  );
}
