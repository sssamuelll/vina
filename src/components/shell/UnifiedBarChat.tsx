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
import { vercelGatewayProvider } from '../../copilot/providers/vercelGateway';
import type { ProviderConfig, ChatMessage as ProviderChatMessage, ProviderToolDef } from '../../copilot/providers/types';
import { loadConnectionsState, getActiveConnection } from '../../copilot/connections/storage';
import { connectionToProviderConfig } from '../../copilot/connections/types';
import { getAllMetaTools } from '../../copilot/reasoning/bridge/meta-tools';
import { classifyError, getErrorMessage } from '../../copilot/errorRecovery';
import { newId } from '../../utils/ids';

// ─── Types ──────────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface Props {
  input: string;
  setInput: (v: string) => void;
  /**
   * Counter incremented by `UnifiedBar` ONLY when the user actually submits
   * (Enter key or Send button click). UnifiedBarChat watches this nonce
   * (not the raw `input` prop) to decide when to fire a send — decoupling
   * per-keystroke input updates from submit intent. Pre-2026-05-28 we
   * watched `input` directly which sent one message per typed character.
   */
  submitNonce: number;
}

// ─── Provider Helper ─────────────────────────────────────────────────────────────

function getProvider(config: ProviderConfig) {
  switch (config.provider) {
    case 'vercel-gateway': return vercelGatewayProvider;
    case 'claude-bridge': return claudeBridgeProvider;
    case 'anthropic': return anthropicProvider;
    case 'openai': return openaiProvider;
    case 'deepseek': return deepseekProvider;
    case 'ollama': return ollamaProvider;
    default: return anthropicProvider;
  }
}

// ─── Component ───────────────────────────────────────────────────────────────────

export default function UnifiedBarChat({ input, setInput, submitNonce }: Props) {
  const dispatch = useDispatch<AppDispatch>();

  // Provider config — derived from the active connection in the new
  // connections store. Starts null (no sync path; IDB is async-only) and
  // hydrates from the active connection on mount.
  const [providerConfig, setProviderConfig] = useState<ProviderConfig | null>(null);

  const loadFromActiveConnection = useCallback(async () => {
    const state = await loadConnectionsState();
    const active = getActiveConnection(state);
    setProviderConfig(active ? connectionToProviderConfig(active) : null);
  }, []);

  useEffect(() => { loadFromActiveConnection(); }, [loadFromActiveConnection]);

  // Listen for connection mutations from ConnectionsList (add / update / delete /
  // set-active / toggle-enabled). One-shot invalidation HINT — in-flight
  // `useAgenticLoop.send` calls keep their captured providerConfig; only
  // subsequent calls see the refreshed value. Mid-conversation active
  // connection switching is out of scope for MVP v1.
  useEffect(() => {
    window.addEventListener('openclo:provider-config-changed', loadFromActiveConnection);
    return () => window.removeEventListener('openclo:provider-config-changed', loadFromActiveConnection);
  }, [loadFromActiveConnection]);

  // Chat messages state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

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

  // Send a chat message. Called from the nonce-watching effect below when
  // the user actually submits (Enter / Send button in UnifiedBar).
  const handleSend = useCallback(async (text: string) => {
    if (!text.trim() || agenticHook.isRunning) return;

    setInput('');

    // Add user message
    const userMsg: ChatMessage = {
      id: newId(),
      role: 'user',
      content: text,
    };
    setMessages(prev => [...prev, userMsg]);

    try {
      const response = await agenticHook.run(text);
      setMessages(prev => [
        ...prev,
        { id: newId(), role: 'assistant', content: response },
      ]);
    } catch (e: unknown) {
      const msg = getErrorMessage(classifyError(e), e);
      setMessages(prev => [
        ...prev,
        { id: newId(), role: 'assistant', content: msg },
      ]);
    }
  }, [agenticHook, setInput]);

  // Watch the submit-nonce from UnifiedBar. It changes ONLY when the user
  // intentionally submits (Enter key or Send button). Per-keystroke input
  // updates do not move the nonce. Initial value is captured in the ref so
  // mount does not auto-fire (`null` sentinel handles the very first run).
  const lastNonceRef = useRef<number | null>(null);
  useEffect(() => {
    if (lastNonceRef.current === null) {
      lastNonceRef.current = submitNonce;
      return;
    }
    if (submitNonce === lastNonceRef.current) return;
    lastNonceRef.current = submitNonce;

    if (!input.trim() || agenticHook.isRunning) return;
    handleSend(input);
  }, [submitNonce, input, handleSend, agenticHook.isRunning]);

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
          {hasProvider ? 'Ask the AI about your design...' : 'Add an AI provider in settings to start chatting.'}
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
