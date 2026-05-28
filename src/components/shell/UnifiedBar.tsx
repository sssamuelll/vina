import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, MessageSquare, Settings, ArrowUp } from 'lucide-react';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import UnifiedBarChat from './UnifiedBarChat';
import UnifiedBarCommands from './UnifiedBarCommands';
import AgentSettings from '../../copilot/AgentSettings';

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

const STORAGE_KEY = 'openclo-bar-position';
const BAR_WIDTH = 560;
const BAR_HEIGHT = 58;

/** Load saved position or default to bottom-center */
function loadPosition(): { x: number; y: number } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return {
    x: Math.round((window.innerWidth - BAR_WIDTH) / 2),
    y: window.innerHeight - BAR_HEIGHT - 24,
  };
}

function clampPosition(x: number, y: number): { x: number; y: number } {
  const minX = 16;
  const maxX = window.innerWidth - BAR_WIDTH - 16;
  const minY = window.innerHeight * 0.8; // top of drag zone (bottom 20%)
  const maxY = window.innerHeight - BAR_HEIGHT - 16;
  return {
    x: Math.max(minX, Math.min(maxX, x)),
    y: Math.max(minY, Math.min(maxY, y)),
  };
}

export default function UnifiedBar({ onOpenTemplates, onOpenPanel }: UnifiedBarProps = {}) {
  const [mode, setMode] = useState<BarMode>('chat');
  const [input, setInput] = useState('');
  const [panelOpen, setPanelOpen] = useState(false);
  // Submit nonce — incremented only when the user actually presses Enter or
  // clicks Send in chat mode. UnifiedBarChat watches this counter (NOT the
  // raw `input` prop) to decide when to fire a chat send. Pre-2026-05-28
  // UnifiedBarChat watched `input` directly, which meant every keystroke
  // arriving from `setInput(e.target.value)` was interpreted as a submit —
  // typing "hola" sent four separate messages "h", "o", "l", "a". Switching
  // to a nonce decouples per-keystroke input updates from submit intent.
  const [submitNonce, setSubmitNonce] = useState(0);
  const [position, setPosition] = useState(loadPosition);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const pieces = useSelector((s: RootState) => s.project.pieces);
  const seams = useSelector((s: RootState) => s.project.seams);

  // Recalculate position on window resize
  useEffect(() => {
    const handler = () => setPosition(prev => clampPosition(prev.x, prev.y));
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // ─── Drag handlers ─────────────────────────────────────────────
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Don't drag from input, buttons, or panel
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'BUTTON' || target.tagName === 'SELECT'
      || target.closest('.unified-bar__input-wrap') || target.closest('.unified-bar__mode-btn')
      || target.closest('.unified-bar__send') || target.closest('.unified-bar__panel')) {
      return;
    }
    e.preventDefault();
    setIsDragging(true);
    dragOffset.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
  }, [position]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMove = (e: MouseEvent) => {
      const clamped = clampPosition(
        e.clientX - dragOffset.current.x,
        e.clientY - dragOffset.current.y,
      );
      setPosition(clamped);
    };

    const handleUp = () => {
      setIsDragging(false);
      setPosition(prev => {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prev)); } catch { /* ignore */ }
        return prev;
      });
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [isDragging]);

  // ─── Keyboard shortcuts ────────────────────────────────────────
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
      // Signal the chat panel that THIS specific input value should be sent.
      // The nonce changes only on intentional submit (Enter / Send button),
      // never on per-keystroke setInput updates from onChange.
      setSubmitNonce((n) => n + 1);
    }
  }, [input, mode]);

  // Suppress unused vars — pieces/seams kept for future metadata display
  void pieces; void seams;

  const barClasses = [
    'unified-bar',
    panelOpen ? 'unified-bar--panel-open' : '',
    isDragging ? 'unified-bar--dragging' : 'unified-bar--draggable',
  ].filter(Boolean).join(' ');

  return (
    <div
      ref={barRef}
      className={barClasses}
      style={{ left: position.x, top: position.y }}
      onMouseDown={handleMouseDown}
    >
      {/* Mode toggle */}
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
              <Icon size={16} />
            </button>
          );
        })}
      </div>

      {/* Input */}
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

      {/* Send button (chat mode) */}
      {mode === 'chat' && (
        <button className="unified-bar__send" onClick={handleSubmit} disabled={!input.trim()}>
          <ArrowUp size={18} />
        </button>
      )}

      {/* Expanding panel */}
      {panelOpen && (
        <div className="unified-bar__panel" onClick={e => e.stopPropagation()}>
          {mode === 'chat' && <UnifiedBarChat input={input} setInput={setInput} submitNonce={submitNonce} />}
          {mode === 'commands' && (
            <UnifiedBarCommands
              query={input}
              onExecute={() => { setPanelOpen(false); setInput(''); }}
              onOpenTemplates={onOpenTemplates ?? (() => {})}
              onOpenPanel={onOpenPanel ?? (() => {})}
            />
          )}
          {mode === 'settings' && (
            <AgentSettings
              onSave={() => {
                // `openclo:provider-config-changed` is a one-shot invalidation HINT,
                // not a transactional channel. Contract:
                //   - Listener (UnifiedBarChat) refreshes providerConfig via
                //     loadProviderConfig() on receipt. If the panel isn't mounted
                //     yet (first chat open after save), the listener's mount-effect
                //     reads provider config from scratch → the hint is redundant
                //     but not incorrect.
                //   - In-flight `useAgenticLoop.send` closures capture providerConfig
                //     at call time. A provider switch mid-stream does NOT cancel or
                //     reroute the in-flight call. This is intentional in MVP v1 —
                //     mid-conversation provider switching is out of scope.
                window.dispatchEvent(new CustomEvent('openclo:provider-config-changed'));
                setPanelOpen(false);
              }}
              onClose={() => setPanelOpen(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}
