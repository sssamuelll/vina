import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useDispatch } from 'react-redux';
import { store } from '../../store';
import type { AppDispatch } from '../../store';
import { useAgenticLoop } from '../../copilot/hooks/useAgenticLoop';
import { getDefaultRegistry } from '../../copilot/action/tools/registry';
import { anthropicProvider } from '../../copilot/providers/anthropic';
import { openaiProvider } from '../../copilot/providers/openai';
import { deepseekProvider } from '../../copilot/providers/deepseek';
import { ollamaProvider } from '../../copilot/providers/ollama';
import { claudeBridgeProvider } from '../../copilot/providers/claudeBridge';
import {
  loadProviderConfig,
  loadProviderConfigSync,
} from '../../copilot/providers/types';
import type { ProviderConfig, ChatMessage as ProviderChatMessage, ProviderToolDef } from '../../copilot/providers/types';
import { getAllMetaTools } from '../../copilot/reasoning/bridge/meta-tools';

// ─── Types ──────────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface Props {
  input: string;
  setInput: (v: string) => void;
}

// ─── Provider Helper ─────────────────────────────────────────────────────────────

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

// ─── Component ───────────────────────────────────────────────────────────────────

export default function UnifiedBarChat({ input, setInput }: Props) {
  const dispatch = useDispatch<AppDispatch>();

  // Provider config
  const [providerConfig, setProviderConfig] = useState<ProviderConfig | null>(loadProviderConfigSync);
  useEffect(() => { loadProviderConfig().then(setProviderConfig); }, []);

  // Listen for provider config changes (settings may be saved from CopilotPanel)
  useEffect(() => {
    const handler = () => { loadProviderConfig().then(setProviderConfig); };
    window.addEventListener('openclo:provider-config-changed', handler);
    return () => window.removeEventListener('openclo:provider-config-changed', handler);
  }, []);

  // Chat messages state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Track the last submitted input to detect new submissions from the parent
  const lastSubmittedRef = useRef<string>('');

  // Tool registry
  const registry = useMemo(() => {
    const reg = getDefaultRegistry();
    reg.setContext(dispatch, () => store.getState());
    return reg;
  }, [dispatch]);

  const actionToolDefs = useMemo(() => {
    const seen = new Set<string>();
    return registry.list().filter(t => {
      if (seen.has(t.name)) return false;
      seen.add(t.name);
      return true;
    }).map(t => ({
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
      return (msgs: ProviderChatMessage[], tools: ProviderToolDef[], config?: unknown) =>
        provider.send(msgs, tools, (config ?? providerConfig) as ProviderConfig);
    }, [providerConfig]),
    metaTools: useMemo(() => getAllMetaTools(), []),
    actionToolDefs,
    getState: () => store.getState(),
    dispatch,
    registry,
    providerConfig: providerConfig ?? undefined,
  });

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, agenticHook.toolCalls]);

  // Detect submit from parent: fires when input is non-empty and different from last submitted
  const handleSend = useCallback(async (text: string) => {
    if (!text.trim() || agenticHook.isRunning) return;

    lastSubmittedRef.current = text;
    setInput('');

    // Add user message
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
    };
    setMessages(prev => [...prev, userMsg]);

    try {
      const response = await agenticHook.run(text);
      setMessages(prev => [
        ...prev,
        { id: `ai-${Date.now()}`, role: 'assistant', content: response },
      ]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'An error occurred';
      setMessages(prev => [
        ...prev,
        { id: `ai-err-${Date.now()}`, role: 'assistant', content: `Error: ${msg}` },
      ]);
    }
  }, [agenticHook, setInput]);

  // Watch for new input submitted by the parent (UnifiedBar presses Enter → sets panelOpen)
  // We trigger when the input is non-empty and hasn't been submitted yet
  const prevInputRef = useRef<string>(input);
  useEffect(() => {
    const prev = prevInputRef.current;
    prevInputRef.current = input;

    // Input cleared by us (after submit) — skip
    if (!input.trim()) return;
    // Same value as last time — no change
    if (input === prev) return;
    // Already submitted this exact string
    if (input === lastSubmittedRef.current) return;

    // New non-empty input arrived — this means the user pressed Enter in UnifiedBar
    handleSend(input);
  }, [input, handleSend]);

  // Running tool indicator
  const runningToolName = agenticHook.toolCalls.find(tc => tc.status === 'running')?.name;

  const hasProvider = providerConfig !== null && (
    providerConfig.provider === 'ollama' ||
    providerConfig.provider === 'claude-bridge' ||
    providerConfig.apiKey.length > 0
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', padding: 'var(--sp-3)', gap: 'var(--sp-2)' }}>
      {/* Empty state */}
      {messages.length === 0 && !agenticHook.isRunning && (
        <div style={{
          textAlign: 'center',
          padding: 'var(--sp-6)',
          color: 'var(--text-ghost)',
          fontSize: 'var(--text-ui)',
        }}>
          {hasProvider ? 'Ask the AI about your design...' : 'Configure AI provider in Copilot settings...'}
        </div>
      )}

      {/* Message list */}
      {messages.map(m => (
        <div key={m.id} className={`chat-message ${m.role === 'user' ? 'chat-message--user' : ''}`}>
          {m.role === 'assistant' && <div className="chat-message__avatar">AI</div>}
          <div className="chat-message__text">{m.content}</div>
        </div>
      ))}

      {/* In-progress tool calls */}
      {agenticHook.isRunning && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--sp-2)',
          padding: 'var(--sp-2) var(--sp-4)',
          color: 'var(--text-muted)',
          fontSize: 'var(--text-sm)',
        }}>
          <div className="chat-message__avatar">AI</div>
          <span style={{ fontStyle: 'italic' }}>
            {runningToolName ? `Running ${runningToolName}...` : 'Thinking...'}
          </span>
        </div>
      )}

      {/* Completed tool calls (shown inline below the thinking indicator) */}
      {agenticHook.toolCalls.filter(tc => tc.status !== 'running').length > 0 && agenticHook.isRunning && (
        <div style={{ padding: '0 var(--sp-4)', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {agenticHook.toolCalls.map((tc, i) => (
            <div key={i} style={{
              fontSize: 'var(--text-xs)',
              color: tc.status === 'error' ? 'var(--color-error, #f87171)' : 'var(--text-ghost)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--sp-1)',
            }}>
              <span>{tc.status === 'done' ? '✓' : tc.status === 'error' ? '✗' : '·'}</span>
              <span>{tc.name}</span>
            </div>
          ))}
        </div>
      )}

      {/* Scroll anchor */}
      <div ref={bottomRef} />
    </div>
  );
}
