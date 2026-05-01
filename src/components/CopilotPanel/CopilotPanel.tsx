/**
 * @module CopilotPanel
 *
 * Feature-owned UI for the copilot subsystem. Imports from `src/copilot/*`
 * are legitimate per the **feature ownership** layer policy
 * (`docs/reports/2026-04-30-drift-fase2-d5-layering-violations.md`).
 */
import { MessageSquare } from 'lucide-react';
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch, store } from '../../store';
import { AgentConfig } from '../../copilot/protocol';
import { getDefaultRegistry } from '../../copilot/action/tools/registry';
import { anthropicProvider } from '../../copilot/providers/anthropic';
import { openaiProvider } from '../../copilot/providers/openai';
import { deepseekProvider } from '../../copilot/providers/deepseek';
import { ollamaProvider } from '../../copilot/providers/ollama';
import { claudeBridgeProvider } from '../../copilot/providers/claudeBridge';
import {
  ProviderConfig,
  loadProviderConfig,
  loadProviderConfigSync,
  PROVIDER_OPTIONS,
} from '../../copilot/providers/types';
import { ProjectMemory } from '../../copilot/memory';
import { useAgenticLoop } from '../../copilot/hooks/useAgenticLoop';
import { getAllMetaTools } from '../../copilot/reasoning/bridge/meta-tools';
import { CostManager } from '../../copilot/costManager';
import { getErrorMessage, classifyError, isOfflineMode } from '../../copilot/errorRecovery';
import AgentSettings from '../../copilot/AgentSettings';
import CopilotHeader from './CopilotHeader';
import CopilotMessages, { DisplayMessage } from './CopilotMessages';
import CopilotInput from './CopilotInput';
import { ProgressMessage } from './ProgressMessage';
import './CopilotPanel.css';
import type { ChatMessage, ProviderToolDef } from '../../copilot/providers/types';
import { storageGet, storageSet, migrateFromLocalStorage } from '../../utils/storage';

const LEGACY_AGENT_STORAGE_KEY = 'openclo-agent-config';
const DEFAULT_AGENT_CONFIG: AgentConfig = { type: 'builtin', name: 'Built-in (Templates)' };

async function loadAgentConfig(): Promise<AgentConfig> {
  const existing = await storageGet<AgentConfig>('settings', 'agent-config');
  if (existing) return existing;
  const migrated = await migrateFromLocalStorage<AgentConfig>(
    LEGACY_AGENT_STORAGE_KEY,
    'settings',
    'agent-config',
  );
  return migrated ?? DEFAULT_AGENT_CONFIG;
}

async function saveAgentConfig(config: AgentConfig): Promise<void> {
  await storageSet('settings', 'agent-config', config);
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
  const project = useSelector((s: RootState) => s.project);

  const [isOpen, setIsOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  /**
   * UI display messages (DisplayMessage[]). Transient — cleared on unmount
   * and project switch. For persistent LLM context, use `memoryRef.current`
   * (ProjectMemory class). Dual maintenance via `recordMessage` helper.
   *
   * Cross-ref: `docs/reports/2026-05-01-drift-fase2-d4-copilotpanel-composition.md`.
   */
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [agentConfig, setAgentConfig] = useState<AgentConfig>(DEFAULT_AGENT_CONFIG);
  const [providerConfig, setProviderConfig] = useState<ProviderConfig | null>(loadProviderConfigSync);

  // Hydrate persisted state asynchronously: agent-config from IDB (BUG-10),
  // provider config API key from SecureStorage (Web Crypto).
  useEffect(() => { loadAgentConfig().then(setAgentConfig); }, []);
  useEffect(() => { loadProviderConfig().then(setProviderConfig); }, []);
  const [isMobile, setIsMobile] = useState(false);
  const [expandedTools, setExpandedTools] = useState<Set<number>>(new Set());
  const [sessionCostLabel, setSessionCostLabel] = useState('');

  const costManagerRef = useRef(new CostManager(project.id));
  /**
   * Persistent LLM context via ProjectMemory class (localStorage,
   * MAX_MESSAGES=50 rolling window). Auto-loaded on construct in
   * `_load()`. Dual-maintained con `messages` useState via
   * `recordMessage` helper. `.save()` called explicitly at end of
   * turn to batch persistence.
   *
   * Cross-ref: `docs/reports/2026-05-01-drift-fase2-d4-copilotpanel-composition.md`.
   */
  const memoryRef = useRef(new ProjectMemory(project.id));
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<{ y: number; time: number } | null>(null);

  const dispatch = useDispatch<AppDispatch>();

  // Tool registry with Redux context
  const registry = useMemo(() => {
    const reg = getDefaultRegistry();
    reg.setContext(dispatch, () => store.getState());
    return reg;
  }, [dispatch]);

  // Build action tool defs for the LLM
  const actionToolDefs = useMemo(() => {
    return registry.list().map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));
  }, [registry]);

  // Agentic loop hook
  const agenticHook = useAgenticLoop({
    send: useMemo(() => {
      if (!providerConfig) return async () => ({ content: '', toolCalls: [] as never[] });
      const provider = getProvider(providerConfig);
      return (messages: ChatMessage[], tools: ProviderToolDef[], config?: unknown) =>
        provider.send(messages, tools, (config ?? providerConfig) as ProviderConfig);
    }, [providerConfig]),
    metaTools: useMemo(() => getAllMetaTools(), []),
    actionToolDefs,
    getState: () => store.getState(),
    dispatch,
    registry,
    providerConfig: providerConfig ?? undefined,
  });

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
    // Clear UI messages when switching projects to prevent cross-project context leak
    setMessages([]);
    setSessionCostLabel('');
  }, [project.id]);

  /**
   * Coordinated dual-write: appends to UI messages AND ProjectMemory.
   *
   * UI display (`messages` useState) is transient — cleared on unmount/project
   * switch. Persistent LLM context lives in `memoryRef.current` (ProjectMemory
   * class, localStorage). This helper concentrates the dual maintenance for the
   * 2 paired sites (user message + assistant message) to prevent UI/context
   * desync if a future handler forgets one side.
   *
   * Note: `memoryRef.current.save()` is called separately at end of turn to
   * batch persistence (not auto-saved per addMessage).
   *
   * Cross-ref: `docs/reports/2026-05-01-drift-fase2-d4-copilotpanel-composition.md`.
   */
  const recordMessage = useCallback((
    msg: DisplayMessage,
    memoryToolsCalled?: string[]
  ) => {
    setMessages(prev => [...prev, msg]);
    memoryRef.current.addMessage({
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp,
      ...(memoryToolsCalled && { toolsCalled: memoryToolsCalled }),
    });
  }, []);

  const isProviderMode = providerConfig !== null && (
    providerConfig.provider === 'ollama' || providerConfig.provider === 'claude-bridge' || providerConfig.apiKey.length > 0
  );
  const offline = isOfflineMode(providerConfig);
  const hasConnection = isProviderMode || agentConfig.type !== 'builtin';
  const providerLabel = providerConfig ? (
    `${providerConfig.provider} / ${providerConfig.model.split('-').slice(0, 2).join('-')}`
  ) : agentConfig.name;

  /** Send via the agentic loop */
  const handleProviderSend = useCallback(async (text: string) => {
    if (!providerConfig || !text.trim()) return;

    recordMessage({ role: 'user', content: text, timestamp: Date.now() });
    setInput('');
    setIsLoading(true);

    if (isMobile && navigator.vibrate) navigator.vibrate(30);

    try {
      const response = await agenticHook.run(text);
      const content = response;

      const assistantMsg: DisplayMessage = {
        role: 'assistant',
        content,
        timestamp: Date.now(),
        toolCalls: agenticHook.toolCalls.map(tc => ({
          name: tc.name,
          success: tc.status === 'done',
        })),
      };
      recordMessage(assistantMsg, agenticHook.toolCalls.map(tc => tc.name));

      // Track cost estimate (rough)
      const estimatedTokens = text.length * 4 + content.length;
      costManagerRef.current.trackUsage(providerConfig.provider, estimatedTokens, content.length, providerConfig.model);
      setSessionCostLabel(costManagerRef.current.formatSessionCost());

      memoryRef.current.save();

      if (costManagerRef.current.shouldWarn()) {
        const warning = costManagerRef.current.getBudgetWarning();
        if (warning) setMessages(prev => [...prev, { role: 'assistant', content: warning, timestamp: Date.now() }]);
      }
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
  }, [providerConfig, isMobile, agenticHook, recordMessage]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;
    await handleProviderSend(text);
  }, [input, isLoading, handleProviderSend]);

  const handleSendText = useCallback(async (text: string) => {
    await handleProviderSend(text);
  }, [handleProviderSend]);

  const handleSettingsSave = useCallback((config: ProviderConfig | null) => {
    setProviderConfig(config);
    if (config) {
      const label = PROVIDER_OPTIONS.find(p => p.value === config.provider)?.label || config.provider;
      setAgentConfig({ type: 'builtin', name: label });
    } else {
      setAgentConfig(DEFAULT_AGENT_CONFIG);
      void saveAgentConfig(DEFAULT_AGENT_CONFIG);
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

      {/* Agentic loop progress indicator */}
      {(agenticHook.isRunning || agenticHook.toolCalls.length > 0) && (
        <ProgressMessage
          toolCalls={agenticHook.toolCalls}
          isRunning={agenticHook.isRunning}
          response={agenticHook.response}
        />
      )}

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
