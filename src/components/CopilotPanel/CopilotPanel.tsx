import { useState, useRef, useEffect, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '../../store';
import { AgentConfig, CopilotMessage, buildCopilotContext } from '../../copilot/protocol';
import { sendToAgent } from '../../copilot/agentConnector';
import { executeCommands } from '../../copilot/commandExecutor';
import './CopilotPanel.css';

const STORAGE_KEY = 'openclo-agent-config';

function loadAgentConfig(): AgentConfig {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return { type: 'builtin', name: 'Built-in (Templates)' };
}

function saveAgentConfig(config: AgentConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

interface CopilotPanelProps {
  isColumn?: boolean;
  onClose?: () => void;
}

export default function CopilotPanel({ isColumn = false, onClose }: CopilotPanelProps = {}) {
  const dispatch = useDispatch<AppDispatch>();
  const project = useSelector((s: RootState) => s.project);
  const editor = useSelector((s: RootState) => s.editor);

  const [isOpen, setIsOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [agentConfig, setAgentConfig] = useState<AgentConfig>(loadAgentConfig);
  const [configEndpoint, setConfigEndpoint] = useState(agentConfig.endpoint || '');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: CopilotMessage = { role: 'user', content: text, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const context = buildCopilotContext(project, editor, text, messages);
      const response = await sendToAgent(agentConfig, context);

      // Execute commands
      const { executed, errors } = executeCommands(response.commands, dispatch, project.pieces);

      let content = response.message;
      if (errors.length > 0) {
        content += `\n⚠️ ${errors.join(', ')}`;
      }
      if (executed > 0) {
        content += `\n✅ ${executed} action${executed > 1 ? 's' : ''} applied`;
      }

      const assistantMsg: CopilotMessage = {
        role: 'assistant',
        content,
        commands: response.commands,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (e: any) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `❌ Error: ${e.message}`,
        timestamp: Date.now(),
      }]);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, project, editor, messages, agentConfig, dispatch]);

  const handleSendText = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;
    const userMsg: CopilotMessage = { role: 'user', content: text, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);
    try {
      const context = buildCopilotContext(project, editor, text, messages);
      const response = await sendToAgent(agentConfig, context);
      const { executed, errors } = executeCommands(response.commands, dispatch, project.pieces);
      let content = response.message;
      if (errors.length > 0) content += `\n⚠️ ${errors.join(', ')}`;
      if (executed > 0) content += `\n✅ ${executed} action${executed > 1 ? 's' : ''} applied`;
      setMessages(prev => [...prev, { role: 'assistant', content, commands: response.commands, timestamp: Date.now() }]);
    } catch (e: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `❌ ${e.message}`, timestamp: Date.now() }]);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, project, editor, messages, agentConfig, dispatch]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSaveConfig = () => {
    let newConfig: AgentConfig;
    if (!configEndpoint.trim()) {
      newConfig = { type: 'builtin', name: 'Built-in (Templates)' };
    } else if (configEndpoint.startsWith('ws://') || configEndpoint.startsWith('wss://')) {
      newConfig = { type: 'websocket', endpoint: configEndpoint, name: 'WebSocket Agent' };
    } else {
      newConfig = { type: 'http', endpoint: configEndpoint, name: 'HTTP Agent' };
    }
    setAgentConfig(newConfig);
    saveAgentConfig(newConfig);
    setShowSettings(false);
  };

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

  // For column mode, always render the panel
  return (
    <div className={`copilot-panel ${isColumn ? 'column-mode' : ''} ${isFullscreen ? 'fullscreen' : ''}`}>
      <div className="copilot-header">
        <div className="copilot-title">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 3H13C13.55 3 14 3.45 14 4V10C14 10.55 13.55 11 13 11H5L2 14V4C2 3.45 2.45 3 3 3Z" fill="var(--accent)" stroke="var(--accent)" strokeWidth="1"/>
          </svg>
          <span>Chat</span>
          {agentConfig.type !== 'builtin' && <span className="copilot-agent-badge">{agentConfig.name}</span>}
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
          <button className="copilot-btn-sm" onClick={() => setMessages([])} title="Clear chat">
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
        <div className="copilot-settings">
          <h4>Agent Configuration</h4>
          <p className="settings-hint">
            Connect your AI agent. Leave empty for built-in template mode.
          </p>
          <div className="settings-field">
            <label>Agent Endpoint</label>
            <input
              type="text"
              placeholder="http://localhost:3001/copilot"
              value={configEndpoint}
              onChange={e => setConfigEndpoint(e.target.value)}
              className="settings-input"
            />
          </div>
          <div className="settings-examples">
            <span>Examples:</span>
            <code>http://localhost:3001/copilot</code>
            <code>ws://localhost:3002/copilot</code>
          </div>
          <button className="settings-save" onClick={handleSaveConfig}>Save</button>
        </div>
      )}

      <div className="copilot-messages">
        {messages.length === 0 && agentConfig.type === 'builtin' && (
          <div className="copilot-empty">
            <svg className="copilot-empty-icon" width="40" height="40" viewBox="0 0 16 16" fill="none">
              <path d="M3 3H13C13.55 3 14 3.45 14 4V10C14 10.55 13.55 11 13 11H5L2 14V4C2 3.45 2.45 3 3 3Z" stroke="var(--text-muted)" strokeWidth="0.8" fill="none"/>
            </svg>
            <p className="copilot-empty-title">Connect an AI agent</p>
            <p className="copilot-empty-hint">
              OpenClo works with any AI agent — Claude, GPT, local models, or your own. 
              Connect one to get pattern generation, editing assistance, and intelligent suggestions.
            </p>
            <button className="copilot-setup-btn" onClick={() => setShowSettings(true)}>
              <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
                <path d="M6 7.5A1.5 1.5 0 1 0 6 4.5A1.5 1.5 0 0 0 6 7.5Z" stroke="currentColor" strokeWidth="1" fill="none"/>
              </svg>
              Configure Agent
            </button>
            <div className="copilot-empty-divider">
              <span>or try built-in templates</span>
            </div>
            <div className="copilot-suggestions">
              {['Generate a bodice block', 'Create a sleeve', 'Generate A-line skirt'].map(s => (
                <button key={s} className="copilot-suggestion" onClick={() => handleSendText(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.length === 0 && agentConfig.type !== 'builtin' && (
          <div className="copilot-empty">
            <p>Connected to <strong>{agentConfig.name}</strong></p>
            <p className="copilot-empty-hint">Ask anything about your patterns:</p>
            <div className="copilot-suggestions">
              {['Generate a bodice block', 'Create a sleeve', 'Adjust the waist by -2cm', 'Add seam allowance to all'].map(s => (
                <button key={s} className="copilot-suggestion" onClick={() => handleSendText(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`copilot-msg ${msg.role}`}>
            <div className="copilot-msg-content">{msg.content}</div>
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

      <div className="copilot-input-area">
        <input
          ref={inputRef}
          type="text"
          className="copilot-input"
          placeholder="Type a message..."
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
