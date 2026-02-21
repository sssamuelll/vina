import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import './CommandPalette.css';

export interface Command {
  id: string;
  name: string;
  category: string;
  shortcut?: string;
  action: () => void;
}

interface CommandPaletteProps {
  commands: Command[];
  isOpen: boolean;
  onClose: () => void;
}

function fuzzyMatch(query: string, text: string): boolean {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

function highlightMatch(query: string, text: string): JSX.Element {
  if (!query) return <>{text}</>;
  const q = query.toLowerCase();
  const parts: JSX.Element[] = [];
  let qi = 0;
  for (let i = 0; i < text.length; i++) {
    if (qi < q.length && text[i].toLowerCase() === q[qi]) {
      parts.push(<span key={i} className="palette-highlight">{text[i]}</span>);
      qi++;
    } else {
      parts.push(<span key={i}>{text[i]}</span>);
    }
  }
  return <>{parts}</>;
}

export default function CommandPalette({ commands, isOpen, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!query) return commands;
    return commands.filter(c =>
      fuzzyMatch(query, c.name) || fuzzyMatch(query, c.category + ' ' + c.name)
    );
  }, [query, commands]);

  // Group by category
  const grouped = useMemo(() => {
    const groups: Record<string, Command[]> = {};
    for (const cmd of filtered) {
      if (!groups[cmd.category]) groups[cmd.category] = [];
      groups[cmd.category].push(cmd);
    }
    return groups;
  }, [filtered]);

  // Flat list for keyboard navigation
  const flatList = useMemo(() => {
    const list: Command[] = [];
    for (const cat of Object.keys(grouped)) {
      list.push(...grouped[cat]);
    }
    return list;
  }, [grouped]);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const item = listRef.current.querySelector('.palette-item.selected');
    if (item) {
      item.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  const executeCommand = useCallback((cmd: Command) => {
    onClose();
    // Delay to let palette close first
    setTimeout(() => cmd.action(), 50);
  }, [onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, flatList.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (flatList[selectedIndex]) {
          executeCommand(flatList[selectedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
    }
  }, [flatList, selectedIndex, executeCommand, onClose]);

  if (!isOpen) return null;

  let itemIndex = -1;

  return (
    <div className="command-palette-overlay" onClick={onClose}>
      <div className="command-palette" onClick={e => e.stopPropagation()}>
        <div className="palette-input-wrapper">
          <span className="palette-prefix">&gt;</span>
          <input
            ref={inputRef}
            type="text"
            className="palette-input"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command..."
          />
        </div>
        <div className="palette-list" ref={listRef}>
          {Object.entries(grouped).map(([category, cmds]) => (
            <div key={category} className="palette-group">
              <div className="palette-category">{category}</div>
              {cmds.map(cmd => {
                itemIndex++;
                const idx = itemIndex;
                return (
                  <div
                    key={cmd.id}
                    className={`palette-item ${idx === selectedIndex ? 'selected' : ''}`}
                    onClick={() => executeCommand(cmd)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                  >
                    <span className="palette-item-name">
                      {highlightMatch(query, cmd.name)}
                    </span>
                    {cmd.shortcut && (
                      <span className="palette-item-shortcut">{cmd.shortcut}</span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
          {flatList.length === 0 && (
            <div className="palette-empty">No matching commands</div>
          )}
        </div>
      </div>
    </div>
  );
}
