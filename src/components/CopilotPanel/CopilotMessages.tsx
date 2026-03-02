import { forwardRef } from 'react';
import ReactMarkdown from 'react-markdown';
import CopilotEmptyState from './CopilotEmptyState';
import { ProgressMessage } from './ProgressMessage/ProgressMessage';
import type { ProgressState } from '../../copilot/reasoning/bridge/types';

/** A displayed message (extends CopilotMessage with streaming and tool call UI) */
export interface DisplayMessage {
  role: 'user' | 'assistant' | 'progress';
  content: string;
  timestamp: number;
  toolCalls?: Array<{ name: string; result?: string; success?: boolean }>;
  isStreaming?: boolean;
  progressState?: ProgressState;
}

interface CopilotMessagesProps {
  messages: DisplayMessage[];
  isLoading: boolean;
  hasConnection: boolean;
  providerLabel: string;
  isMobile: boolean;
  expandedTools: Set<number>;
  onToggleExpandTool: (index: number) => void;
  onOpenSettings: () => void;
  onSendText: (text: string) => void;
  onProgressAnswer?: (answer: string) => void;
  onProgressUndo?: () => void;
}

const CopilotMessages = forwardRef<HTMLDivElement, CopilotMessagesProps>(({
  messages,
  isLoading,
  hasConnection,
  providerLabel,
  isMobile,
  expandedTools,
  onToggleExpandTool,
  onOpenSettings,
  onSendText,
  onProgressAnswer,
  onProgressUndo,
}, ref) => {
  return (
    <div className="copilot-messages">
      {messages.length === 0 && (
        <CopilotEmptyState
          hasConnection={hasConnection}
          providerLabel={providerLabel}
          onOpenSettings={onOpenSettings}
          onSendText={onSendText}
        />
      )}
      {messages.map((msg, i) => (
        msg.role === 'progress' && msg.progressState ? (
          <ProgressMessage
            key={i}
            state={msg.progressState}
            onAnswer={onProgressAnswer}
            onUndo={onProgressUndo}
          />
        ) : (
          <div key={i} className={`copilot-msg ${msg.role}`}>
            <div className="copilot-msg-content copilot-markdown">
              <ReactMarkdown>{msg.content}</ReactMarkdown>
              {msg.toolCalls && msg.toolCalls.length > 0 && (
                <div
                  className={`copilot-tool-calls ${isMobile ? 'compact' : ''}`}
                  onClick={() => {
                    if (isMobile) {
                      onToggleExpandTool(i);
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
        )
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
      <div ref={ref} />
    </div>
  );
});

CopilotMessages.displayName = 'CopilotMessages';

export default CopilotMessages;
