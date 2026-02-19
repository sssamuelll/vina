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

export default function CopilotPanel() {
  const dispatch = useDispatch<AppDispatch>();
  const project = useSelector((s: RootState) => s.project);
  const editor = useSelector((s: RootState) => s.editor);

  const [isOpen, setIsOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
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

  if (!isOpen) {
    return (
      <button
        className="copilot-toggle"
        onClick={() => setIsOpen(true)}
        title="AI Copilot (Ctrl+K)"
      >
        <span className="copilot-icon">✨</span>
      </button>
    );
  }

  return (
    <div className="copilot-panel">
      <div className="copilot-header">
        <div className="copilot-title">
          <span className="copilot-icon-sm">✨</span>
          <span>Copilot</span>
          <span className="copilot-agent-badge">{agentConfig.name}</span>
        </div>
        <div className="copilot-header-actions">
          <button className="copilot-btn-sm" onClick={() => setShowSettings(!showSettings)} title="Settings">⚙</button>
          <button className="copilot-btn-sm" onClick={() => setMessages([])} title="Clear chat">🗑</button>
          <button className="copilot-btn-sm" onClick={() => setIsOpen(false)} title="Close">✕</button>
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
        {messages.length === 0 && (
          <div className="copilot-empty">
            <p>👋 Hi! I'm your pattern copilot.</p>
            <p className="copilot-empty-hint">Try:</p>
            <div className="copilot-suggestions">
              {['Generate a bodice block', 'Create a sleeve', 'Generate A-line skirt', 'Genera un pantalón'].map(s => (
                <button key={s} className="copilot-suggestion" onClick={() => { setInput(s); }}>
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
          placeholder="Ask the copilot..."
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
