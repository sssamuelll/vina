import { useState, useCallback, useEffect, useRef, useMemo, Fragment } from 'react';
import { useDispatch } from 'react-redux';
import { Paperclip, X } from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { store } from '../../store';
import type { AppDispatch } from '../../store';
import { addPiece } from '../../store/projectSlice';
import { selectPiece, requestFitView } from '../../store/editorSlice';
import { showSuccessToast } from '../../store/copilotUISlice';
import { piecesLabel, promptSafeName, type PendingDXFAttachment } from './dxfImport';
import { useAgenticLoop, type ToolCallProgress } from '../../copilot/hooks/useAgenticLoop';
import { getDefaultRegistry } from '../../copilot/action/tools/registry';
import { mensajeDeErrorEs } from '../../copilot/action/tools/mensajeDeErrorEs';
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
  /** Tool calls the agent made on this turn — the auditable decision trail.
   *  Persisted on the message because the hook's live `toolCalls` resets on
   *  the next run. Only set on assistant messages that ran the loop. */
  toolCalls?: ToolCallProgress[];
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
  /** DXF attached to the input but not yet sent. Imported into the project
   *  (atomically) when the message is sent; the agent then operates on the
   *  loaded pieces. Null when nothing is attached. */
  pendingDXF: PendingDXFAttachment | null;
  /** Clear the attachment (× on the chip, or after it is consumed by send). */
  clearAttachment: () => void;
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

export default function UnifiedBarChat({ input, setInput, submitNonce, pendingDXF, clearAttachment }: Props) {
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
    window.addEventListener('vina:provider-config-changed', loadFromActiveConnection);
    return () => window.removeEventListener('vina:provider-config-changed', loadFromActiveConnection);
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
    const attachment = pendingDXF;
    if ((!text.trim() && !attachment) || agenticHook.isRunning) return;

    setInput('');

    // Consume the attachment: import its pieces into the project (atomic,
    // single point) and clear the chip. The agent then operates on real
    // loaded state — it never receives raw file bytes (sandbox-safe).
    let agentText = text;
    let displayContent = text;
    if (attachment) {
      for (const piece of attachment.pieces) dispatch(addPiece(piece));
      dispatch(selectPiece(attachment.pieces[0].id));
      dispatch(requestFitView()); // frame the imported pattern in the 2D canvas
      clearAttachment();
      // The filename is attacker-controlled and never passes through the DXF
      // parser, so it reaches the model unfiltered unless we neutralize the
      // delimiters of the context note here. See `promptSafeName`.
      const safeName = promptSafeName(attachment.name);
      const label = `${safeName} · ${piecesLabel(attachment.pieces.length)}`;
      displayContent = text.trim() ? `📎 ${label}\n${text}` : `📎 ${label}`;
      const note = `[Contexto: el usuario adjuntó y cargó un patrón DXF "${safeName}" con ${attachment.pieces.length} piezas, ya presentes en el proyecto.]`;
      agentText = text.trim()
        ? `${note}\n\n${text}`
        : `${note}\n\nAcabo de cargar este patrón. ¿Qué puedes hacer con él?`;
    }

    // Add user message (shows the attachment chip inline if present).
    const userMsg: ChatMessage = { id: newId(), role: 'user', content: displayContent };
    setMessages(prev => [...prev, userMsg]);

    // No provider configured: the pieces are already imported (María sees
    // her pattern); confirm instead of running the agent against a no-op send.
    const providerReady = providerConfig !== null && (
      providerConfig.provider === 'ollama' ||
      providerConfig.provider === 'claude-bridge' ||
      providerConfig.apiKey.length > 0
    );
    if (attachment && !providerReady) {
      dispatch(showSuccessToast(`Cargué tu patrón: ${piecesLabel(attachment.pieces.length)}`));
      setMessages(prev => [...prev, {
        id: newId(),
        role: 'assistant',
        content: `Cargué tu patrón (${piecesLabel(attachment.pieces.length)}). Configura un proveedor de IA en ajustes para que pueda ayudarte con él.`,
      }]);
      return;
    }

    try {
      const { response, toolCalls } = await agenticHook.run(agentText);
      setMessages(prev => [
        ...prev,
        { id: newId(), role: 'assistant', content: response, toolCalls },
      ]);
    } catch (e: unknown) {
      const msg = getErrorMessage(classifyError(e), e);
      setMessages(prev => [
        ...prev,
        { id: newId(), role: 'assistant', content: msg },
      ]);
    }
  }, [agenticHook, setInput, pendingDXF, clearAttachment, dispatch, providerConfig]);

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

    if ((!input.trim() && !pendingDXF) || agenticHook.isRunning) return;
    handleSend(input);
  }, [submitNonce, input, pendingDXF, handleSend, agenticHook.isRunning]);

  // Running tool indicator
  const runningToolName = agenticHook.toolCalls.find(tc => tc.status === 'running')?.name;

  const hasProvider = providerConfig !== null && (
    providerConfig.provider === 'ollama' ||
    providerConfig.provider === 'claude-bridge' ||
    providerConfig.apiKey.length > 0
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', padding: 'var(--sp-3)', gap: 'var(--sp-2)', userSelect: 'text', cursor: 'text' }}>
      {/* Empty state */}
      {messages.length === 0 && !agenticHook.isRunning && (
        <div style={{
          textAlign: 'center',
          padding: 'var(--sp-6)',
          color: 'var(--text-ghost)',
          fontSize: 'var(--text-ui)',
        }}>
          {hasProvider ? 'Pregúntale a la IA sobre tu diseño...' : 'Agrega un proveedor de IA en ajustes para empezar a conversar.'}
        </div>
      )}

      {/* Message list */}
      {messages.map(m => (
        <Fragment key={m.id}>
          <div className={`chat-message ${m.role === 'user' ? 'chat-message--user' : ''}`}>
            {m.role === 'assistant' && <div className="chat-message__avatar">IA</div>}
            <div className="chat-message__text">
              {m.role === 'assistant' ? (
                <div className="chat-markdown">
                  <Markdown remarkPlugins={[remarkGfm]}>{m.content}</Markdown>
                </div>
              ) : (
                m.content
              )}
            </div>
          </div>
          {/* Persistent decision trail — the agent's tools for THIS turn, kept
              visible after completion so the process is auditable. */}
          {m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0 && (
            <div
              style={{
                marginLeft: 'var(--sp-6)',
                marginTop: -2,
                marginBottom: 'var(--sp-1)',
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                fontSize: 'var(--text-xs)',
                borderLeft: '2px solid var(--border)',
                paddingLeft: 'var(--sp-2)',
              }}
            >
              {m.toolCalls.map((tc, i) => (
                <Fragment key={i}>
                  {/* The agent's rationale for this batch — its WHY, shown
                      above the action(s) it explains. */}
                  {tc.reason && (
                    <div
                      style={{
                        marginTop: i === 0 ? 0 : 4,
                        color: 'var(--text-muted)',
                        fontStyle: 'italic',
                        lineHeight: 1.4,
                      }}
                    >
                      {tc.reason}
                    </div>
                  )}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: 'var(--sp-1)',
                      color: tc.status === 'error' ? 'var(--color-error)' : 'var(--text-ghost)',
                    }}
                  >
                    <span style={{ flexShrink: 0 }}>
                      {tc.status === 'done' ? '✓' : tc.status === 'error' ? '✗' : '·'}
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>{tc.name}</span>
                    {/* #1194 — el error se traduce al pintarlo, no al producirlo:
                        `classifyError` y el reintento del LLM leen el original. */}
                    {tc.error && <span style={{ opacity: 0.85 }}>— {mensajeDeErrorEs(tc.error)}</span>}
                  </div>
                </Fragment>
              ))}
            </div>
          )}
        </Fragment>
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
          <div className="chat-message__avatar">IA</div>
          <span style={{ fontStyle: 'italic' }}>
            {runningToolName ? `Ejecutando ${runningToolName}...` : 'Pensando...'}
          </span>
        </div>
      )}

      {/* Completed tool calls (shown inline below the thinking indicator) */}
      {agenticHook.toolCalls.filter(tc => tc.status !== 'running').length > 0 && agenticHook.isRunning && (
        <div style={{ padding: '0 var(--sp-4)', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {agenticHook.toolCalls.map((tc, i) => (
            <div key={i} style={{
              fontSize: 'var(--text-xs)',
              color: tc.status === 'error' ? 'var(--color-error)' : 'var(--text-ghost)',
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

      {/* Pending DXF attachment chip — sits just above the input until sent */}
      {pendingDXF && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--sp-2)',
            padding: 'var(--sp-2) var(--sp-3)',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            fontSize: 'var(--text-sm)',
          }}
        >
          <Paperclip size={14} style={{ flexShrink: 0, color: 'var(--text-secondary)' }} />
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>
            {pendingDXF.name} · {piecesLabel(pendingDXF.pieces.length)}
          </span>
          <button
            type="button"
            onClick={clearAttachment}
            aria-label="Quitar adjunto"
            title="Quitar"
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', flexShrink: 0, padding: 2 }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Scroll anchor */}
      <div ref={bottomRef} />
    </div>
  );
}
