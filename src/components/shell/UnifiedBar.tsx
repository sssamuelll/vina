import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, MessageSquare, Settings, ArrowUp } from 'lucide-react';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { loadProviderConfigSync } from '../../copilot/providers/types';
import UnifiedBarChat from './UnifiedBarChat';
import UnifiedBarCommands from './UnifiedBarCommands';
import UnifiedBarSettings from './UnifiedBarSettings';

export type BarMode = 'chat' | 'commands' | 'settings';

interface UnifiedBarProps {
  onOpenTemplates?: () => void;
  onOpenPanel?: (name: string) => void;
}

const MODE_ICONS: Record<BarMode, typeof MessageSquare> = {
  chat: MessageSquare,
  commands: Search,
  settings: Settings,
};

const MODE_PLACEHOLDERS: Record<BarMode, string> = {
  chat: 'Design with AI...',
  commands: 'Type a command...',
  settings: 'Search settings...',
};

export default function UnifiedBar({ onOpenTemplates, onOpenPanel }: UnifiedBarProps = {}) {
  const [mode, setMode] = useState<BarMode>('chat');
  const [input, setInput] = useState('');
  const [panelOpen, setPanelOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pieces = useSelector((s: RootState) => s.project.pieces);
  const seams = useSelector((s: RootState) => s.project.seams);

  const config = loadProviderConfigSync();
  const modelLabel = config?.model ?? 'No AI';

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setMode('commands');
        setPanelOpen(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
      if (e.key === 'Escape') {
        setPanelOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleInputFocus = useCallback(() => {
    if (mode === 'commands' || mode === 'settings') {
      setPanelOpen(true);
    }
  }, [mode]);

  const handleSubmit = useCallback(() => {
    if (!input.trim()) return;
    if (mode === 'chat') {
      setPanelOpen(true);
    }
  }, [input, mode]);

  return (
    <div className="unified-bar">
      <div className="unified-bar__modes">
        {(Object.keys(MODE_ICONS) as BarMode[]).map(m => {
          const Icon = MODE_ICONS[m];
          return (
            <button
              key={m}
              className={`unified-bar__mode-btn ${mode === m ? 'unified-bar__mode-btn--active' : ''}`}
              onClick={() => { setMode(m); setPanelOpen(m !== 'chat'); inputRef.current?.focus(); }}
              aria-label={`${m} mode`}
            >
              <Icon size={12} />
            </button>
          );
        })}
      </div>

      <div className="unified-bar__input-wrap">
        <input
          ref={inputRef}
          className="unified-bar__input"
          value={input}
          onChange={e => { setInput(e.target.value); if (mode === 'commands') setPanelOpen(true); }}
          onFocus={handleInputFocus}
          onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
          placeholder={MODE_PLACEHOLDERS[mode]}
        />
        {mode === 'commands' && <span className="unified-bar__shortcut">⌘K</span>}
      </div>

      {mode === 'chat' && <span className="unified-bar__model">{modelLabel}</span>}

      {mode === 'chat' && (
        <button className="unified-bar__send" onClick={handleSubmit} disabled={!input.trim()}>
          <ArrowUp size={14} />
        </button>
      )}

      <div className="unified-bar__meta">
        <span>{pieces.length} pieces</span>
        <span>·</span>
        <span>{seams.length} seams</span>
      </div>

      {panelOpen && (
        <div className="unified-bar__panel" onClick={e => e.stopPropagation()}>
          {mode === 'chat' && <UnifiedBarChat input={input} setInput={setInput} />}
          {mode === 'commands' && (
            <UnifiedBarCommands
              query={input}
              onExecute={() => { setPanelOpen(false); setInput(''); }}
              onOpenTemplates={onOpenTemplates ?? (() => {})}
              onOpenPanel={onOpenPanel ?? (() => {})}
            />
          )}
          {mode === 'settings' && <UnifiedBarSettings />}
        </div>
      )}
    </div>
  );
}
