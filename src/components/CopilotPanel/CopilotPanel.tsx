import { MessageSquare } from 'lucide-react';
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { RootState, store } from '../../store';
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
  PROVIDER_OPTIONS,
} from '../../copilot/providers/types';
import { ProjectMemory } from '../../copilot/memory';
import { Planner } from '../../copilot/reasoning/bridge/Planner';
import { buildAgentContext, serializeContext } from '../../copilot/perception/contextBuilder';
import { useBridge } from '../../copilot/hooks/useBridge';
import { ProgressMessage } from './ProgressMessage';
import { CostManager } from '../../copilot/costManager';
import { getErrorMessage, classifyError, isOfflineMode } from '../../copilot/errorRecovery';
import AgentSettings from '../../copilot/AgentSettings';
import CopilotHeader from './CopilotHeader';
import CopilotMessages, { DisplayMessage } from './CopilotMessages';
import CopilotInput from './CopilotInput';
import './CopilotPanel.css';
import { IntelligentContext } from '../../copilot/reasoning/intelligence';
import { AgenticPlanner } from '../../copilot/reasoning/bridge/AgenticPlanner';
import { getAllMetaTools } from '../../copilot/reasoning/bridge/meta-tools';

const AGENT_STORAGE_KEY = 'openclo-agent-config';

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
  const project = useSelector((s: RootState) => s.project);

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

  const costManagerRef = useRef(new CostManager(project.id));
  const memoryRef = useRef(new ProjectMemory(project.id));
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<{ y: number; time: number } | null>(null);

  const agenticPlannerRef = useRef<AgenticPlanner | null>(null);

  // Create AgenticPlanner when provider is configured
  const agenticPlanner = useMemo(() => {
    if (!providerConfig) return undefined;

    const provider = getProvider(providerConfig);
    const registry = getDefaultRegistry();
    const toolSchemas = registry.list().map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));

    const planner = new AgenticPlanner({
      send: (messages, tools, config) => provider.send(messages, tools, (config ?? providerConfig) as ProviderConfig),
      metaTools: getAllMetaTools(),
      toolSchemas,
      getState: () => store.getState(),
      providerConfig,
    });

    agenticPlannerRef.current = planner;
    return planner;
  }, [providerConfig]);

  // Bridge mode hook (called unconditionally per React rules)
  // Uses ExecutionBridge for step-by-step execution
  const bridgeHook = useBridge({
    plannerLLM: async (userRequest) => {
      if (!providerConfig) return '';

      // Build proper system prompt with tools and context
      const registry = getDefaultRegistry();
      const planner = new Planner();

      // Convert registry tools to Planner schema format
      const toolSchemas = registry.list().map(t => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      }));

      // Build system prompt with JSON instructions and tools
      const plannerPrompt = planner.buildSystemPrompt(toolSchemas);

      // NEW: Use IntelligentContext for enriched resolution
      const intelligence = new IntelligentContext(store.getState());
      const enrichedContext = intelligence.process(userRequest);
      const enrichedStr = intelligence.getSerialized(enrichedContext);

      // Add base project context for reference
      const agentContext = buildAgentContext(store.getState(), []);
      const contextStr = serializeContext(agentContext);

      // Combine: Planner instructions + Enriched context + Project state
      const systemPrompt = `${plannerPrompt}

## Resolved Context (use these values)
${enrichedStr}

## Project State (reference only)
${contextStr}`;

      const provider = getProvider(providerConfig);
      const response = await provider.send(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userRequest }
        ],
        [],
        providerConfig
      );
      return response.content;
    },
    evaluator: async () => {
      // Evaluation always succeeds for now - can be enhanced later
      return { success: true, data: { decision: 'proceed' } };
    },
    reasonerLLM: async (prompt) => {
      if (!providerConfig) {
        return { action: 'abort' as const, reason: 'No provider configured' };
      }
      const provider = getProvider(providerConfig);
      const response = await provider.send(
        [{ role: 'user', content: prompt }],
        [],
        providerConfig
      );
      // Parse response as JSON
      try {
        return JSON.parse(response.content);
      } catch {
        return { action: 'abort' as const, reason: 'Could not parse reasoner response' };
      }
    },
    agenticPlanner,
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

  const isProviderMode = providerConfig !== null && (
    providerConfig.provider === 'ollama' || providerConfig.provider === 'claude-bridge' || providerConfig.apiKey.length > 0
  );
  const offline = isOfflineMode(providerConfig);
  const hasConnection = isProviderMode || agentConfig.type !== 'builtin';
  const providerLabel = providerConfig ? (
    `${providerConfig.provider} / ${providerConfig.model.split('-').slice(0, 2).join('-')}`
  ) : agentConfig.name;

  /** Send via the bridge execution system */
  const handleProviderSend = useCallback(async (text: string) => {
    if (!providerConfig || !text.trim()) return;

    const userMsg: DisplayMessage = { role: 'user', content: text, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    memoryRef.current.addMessage({ role: 'user', content: text, timestamp: Date.now() });
    setInput('');
    setIsLoading(true);

    if (isMobile && navigator.vibrate) navigator.vibrate(30);

    try {
      // Use bridge mode - step-by-step execution via ExecutionBridge
      const bridgeResult = await bridgeHook.run(text);

      // Convert bridge result to display message
      const content = bridgeResult.success
        ? (bridgeResult.summary?.short ?? 'Done')
        : (bridgeResult.error ?? 'Execution failed');

      const assistantMsg: DisplayMessage = {
        role: 'assistant',
        content,
        timestamp: Date.now(),
        toolCalls: bridgeResult.results.map(r => ({
          name: r.stepId,
          success: r.success,
        })),
      };
      setMessages(prev => [...prev, assistantMsg]);

      // Track cost estimate (rough)
      const estimatedTokens = text.length * 4 + content.length;
      costManagerRef.current.trackUsage(providerConfig.provider, estimatedTokens, content.length, providerConfig.model);
      setSessionCostLabel(costManagerRef.current.formatSessionCost());

      memoryRef.current.addMessage({
        role: 'assistant',
        content,
        timestamp: Date.now(),
        toolsCalled: bridgeResult.results.map(r => r.stepId),
      });
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
  }, [providerConfig, isMobile, bridgeHook]);

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

      {/* Bridge mode progress indicator */}
      {bridgeHook.progress && (
        <ProgressMessage
          state={bridgeHook.progress}
          onAnswer={bridgeHook.answer}
          onUndo={bridgeHook.undo}
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
