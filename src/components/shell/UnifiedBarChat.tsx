import { useEffect, useRef, Fragment } from 'react';
import { useSelector } from 'react-redux';
import { Paperclip, X } from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { RootState } from '../../store';
import { piecesLabel, type PendingDXFAttachment } from './dxfImport';
import { mensajeDeErrorEs } from '../../copilot/action/tools/mensajeDeErrorEs';
import { detener } from '../../copilot/conversacion';

interface Props {
  /** DXF attached to the input but not yet sent. Imported into the project
   *  (atomically) when the message is sent; the agent then operates on the
   *  loaded pieces. Null when nothing is attached. */
  pendingDXF: PendingDXFAttachment | null;
  /** Clear the attachment (× on the chip, or after it is consumed by send). */
  clearAttachment: () => void;
}

/**
 * La conversación con la IA. Solo pinta: la conversación y el turno del agente
 * viven en el slice `ia`, el agente corre en `copilot/conversacion.ts`, y
 * envía la barra. Ocultarla no los pierde (spec 2026-10-02 § 6.2).
 */
export default function UnifiedBarChat({ pendingDXF, clearAttachment }: Props) {
  const { mensajes, trabajando, enCurso } = useSelector((s: RootState) => s.ia);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensajes, enCurso]);

  // Running tool indicator
  const runningToolName = enCurso.find(tc => tc.status === 'running')?.name;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', padding: 'var(--sp-3)', gap: 'var(--sp-2)', userSelect: 'text', cursor: 'text' }}>
      {/* Message list */}
      {mensajes.map(m => (
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
                      color: tc.status === 'error' ? 'var(--color-error)' : 'var(--text-tertiary)',
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
      {trabajando && (
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
          <button type="button" className="unified-bar__detener" onClick={detener}>
            Detener
          </button>
        </div>
      )}

      {/* Completed tool calls (shown inline below the thinking indicator) */}
      {enCurso.filter(tc => tc.status !== 'running').length > 0 && trabajando && (
        <div style={{ padding: '0 var(--sp-4)', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {enCurso.map((tc, i) => (
            <div key={i} style={{
              fontSize: 'var(--text-xs)',
              color: tc.status === 'error' ? 'var(--color-error)' : 'var(--text-tertiary)',
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
