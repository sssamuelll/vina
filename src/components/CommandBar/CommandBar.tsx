/**
 * CommandBar — persistent AI command input at the bottom of the workspace.
 *
 * Primary way users interact with the AI copilot. Always visible above the
 * status bar. Includes quick-action pills, a text input, send button, and
 * an expandable response panel that slides up when the AI responds.
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
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
import type { ProviderConfig, ChatMessage, ProviderToolDef } from '../../copilot/providers/types';
import { getAllMetaTools } from '../../copilot/reasoning/bridge/meta-tools';
import { ArrowUp, ChevronDown, Sparkles } from 'lucide-react';
import './CommandBar.css';

// ─── Quick Actions ─────────────────────────────────────────────────────────────

const QUICK_ACTIONS = [
  { label: 'Dress Avatar', command: 'dress the avatar with the current pattern' },
  { label: 'Auto-Sew', command: 'detect and create all seams between the pattern pieces' },
  { label: 'Grade S-XL', command: 'grade this pattern from S to XL using EU Women sizing' },
];

// ─── Provider Helper ────────────────────────────────────────────────────────────

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

/** Auto-dismiss timeout in ms */
const RESPONSE_AUTO_DISMISS_MS = 10_000;

// ─── Component ──────────────────────────────────────────────────────────────────

export default function CommandBar() {
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

  // Input state
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Response state
  const [responseText, setResponseText] = useState<string | null>(null);
  const [responseExpanded, setResponseExpanded] = useState(false);
  const autoDismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tool registry (shared singleton pattern)
  const registry = useMemo(() => {
    const reg = getDefaultRegistry();
    reg.setContext(dispatch, () => store.getState());
    return reg;
  }, [dispatch]);

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

  // Model display label
  const modelLabel = useMemo(() => {
    if (!providerConfig) return '';
    const model = providerConfig.model;
    // Shorten common model names
    if (model.includes('claude-sonnet-4')) return 'Claude Sonnet 4';
    if (model.includes('claude-opus-4')) return 'Claude Opus 4';
    if (model.includes('claude-3-5-haiku')) return 'Claude 3.5 Haiku';
    if (model.includes('claude-code')) return 'Claude Code';
    if (model.includes('gpt-4o-mini')) return 'GPT-4o Mini';
    if (model.includes('gpt-4o')) return 'GPT-4o';
    if (model.includes('deepseek')) return 'DeepSeek';
    // Fallback: first two segments
    return model.split('-').slice(0, 3).join(' ');
  }, [providerConfig]);

  const hasProvider = providerConfig !== null && (
    providerConfig.provider === 'ollama' ||
    providerConfig.provider === 'claude-bridge' ||
    providerConfig.apiKey.length > 0
  );

  // ─── Auto-dismiss response ──────────────────────────────────────────────────

  const clearAutoDismiss = useCallback(() => {
    if (autoDismissTimer.current) {
      clearTimeout(autoDismissTimer.current);
      autoDismissTimer.current = null;
    }
  }, []);

  const startAutoDismiss = useCallback(() => {
    clearAutoDismiss();
    autoDismissTimer.current = setTimeout(() => {
      setResponseExpanded(false);
    }, RESPONSE_AUTO_DISMISS_MS);
  }, [clearAutoDismiss]);

  // Clean up timer on unmount
  useEffect(() => clearAutoDismiss, [clearAutoDismiss]);

  // ─── Send Handler ───────────────────────────────────────────────────────────

  const handleSend = useCallback(async (text: string) => {
    if (!providerConfig || !text.trim() || isLoading) return;

    setInput('');
    setIsLoading(true);
    setResponseText(null);
    setResponseExpanded(false);
    clearAutoDismiss();

    try {
      const response = await agenticHook.run(text);
      setResponseText(response);
      setResponseExpanded(true);
      startAutoDismiss();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'An error occurred';
      setResponseText(`Error: ${msg}`);
      setResponseExpanded(true);
      startAutoDismiss();
    } finally {
      setIsLoading(false);
    }
  }, [providerConfig, isLoading, agenticHook, clearAutoDismiss, startAutoDismiss]);

  const handleInputSend = useCallback(() => {
    const text = input.trim();
    if (text) handleSend(text);
  }, [input, handleSend]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleInputSend();
    }
  }, [handleInputSend]);

  const handleQuickAction = useCallback((command: string) => {
    handleSend(command);
  }, [handleSend]);

  const handleDismissResponse = useCallback(() => {
    setResponseExpanded(false);
    clearAutoDismiss();
  }, [clearAutoDismiss]);

  // Pause auto-dismiss when hovering over response
  const handleResponseMouseEnter = useCallback(() => {
    clearAutoDismiss();
  }, [clearAutoDismiss]);

  const handleResponseMouseLeave = useCallback(() => {
    if (responseExpanded) startAutoDismiss();
  }, [responseExpanded, startAutoDismiss]);

  // Focus input on Ctrl+L / Cmd+L
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'l') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Running tool indicator
  const runningToolName = agenticHook.toolCalls.find(tc => tc.status === 'running')?.name;

  return (
    <div className="command-bar">
      {/* Expandable response area */}
      {responseExpanded && responseText && (
        <div
          className="command-bar-response"
          onMouseEnter={handleResponseMouseEnter}
          onMouseLeave={handleResponseMouseLeave}
        >
          <button
            className="command-bar-response-dismiss"
            onClick={handleDismissResponse}
            title="Dismiss"
          >
            <ChevronDown size={14} />
          </button>
          <div className="command-bar-response-text">
            {responseText}
          </div>
        </div>
      )}

      {/* Quick actions + model indicator row */}
      <div className="command-bar-actions-row">
        <div className="command-bar-quick-actions">
          {QUICK_ACTIONS.map(action => (
            <button
              key={action.label}
              className="command-bar-pill"
              onClick={() => handleQuickAction(action.command)}
              disabled={isLoading || !hasProvider}
              title={action.command}
            >
              {action.label}
            </button>
          ))}
        </div>
        {modelLabel && (
          <span className="command-bar-model">{modelLabel}</span>
        )}
      </div>

      {/* Input row */}
      <div className="command-bar-input-row">
        <div className="command-bar-input-wrapper">
          <Sparkles size={14} className="command-bar-input-icon" />
          <input
            ref={inputRef}
            className="command-bar-input"
            type="text"
            placeholder={
              isLoading
                ? runningToolName
                  ? `Running ${runningToolName}...`
                  : 'Thinking...'
                : hasProvider
                  ? 'Design with AI...'
                  : 'Configure AI provider in Copilot settings...'
            }
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading || !hasProvider}
          />
        </div>
        <button
          className="command-bar-send"
          onClick={handleInputSend}
          disabled={isLoading || !input.trim() || !hasProvider}
          title="Send (Enter)"
        >
          <ArrowUp size={16} />
        </button>
      </div>
    </div>
  );
}
