import { useState } from 'react';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface Props {
  input: string;
  setInput: (v: string) => void;
}

export default function UnifiedBarChat({ input: _input, setInput: _setInput }: Props) {
  const [messages] = useState<ChatMessage[]>([]);

  return (
    <div style={{ padding: 'var(--sp-3)' }}>
      {messages.length === 0 && (
        <div style={{ textAlign: 'center', padding: 'var(--sp-6)', color: 'var(--text-ghost)', fontSize: 'var(--text-ui)' }}>
          Ask the AI about your design...
        </div>
      )}
      {messages.map(m => (
        <div key={m.id} className={`chat-message ${m.role === 'user' ? 'chat-message--user' : ''}`}>
          {m.role === 'assistant' && <div className="chat-message__avatar">AI</div>}
          <div className="chat-message__text">{m.content}</div>
        </div>
      ))}
    </div>
  );
}
