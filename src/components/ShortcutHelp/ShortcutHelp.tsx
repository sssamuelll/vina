/**
 * ShortcutHelp — ? key overlay showing all keyboard shortcuts.
 * Grouped by category, CLO3D-style.
 */

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { getShortcutMap, type ShortcutEntry } from '../../hooks/useKeyboardShortcuts';
import './ShortcutHelp.css';

function formatKey(entry: ShortcutEntry): string {
  const parts: string[] = [];
  if (entry.ctrl) parts.push('Ctrl');
  if (entry.shift) parts.push('Shift');
  if (entry.alt) parts.push('Alt');
  parts.push(entry.key);
  return parts.join('+');
}

export default function ShortcutHelp() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
        e.preventDefault();
        setVisible(v => !v);
      }
      if (e.key === 'Escape' && visible) {
        setVisible(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [visible]);

  if (!visible) return null;

  const shortcuts = getShortcutMap();
  const categories = [...new Set(shortcuts.map(s => s.category))];

  return (
    <div className="shortcut-overlay" onClick={() => setVisible(false)}>
      <div className="shortcut-dialog" onClick={e => e.stopPropagation()}>
        <div className="shortcut-header">
          <h2>Keyboard Shortcuts</h2>
          <button className="shortcut-close" onClick={() => setVisible(false)}>
            <X size={16} />
          </button>
        </div>
        <div className="shortcut-body">
          {categories.map(cat => (
            <div key={cat} className="shortcut-group">
              <h3>{cat}</h3>
              {shortcuts.filter(s => s.category === cat).map((s, i) => (
                <div key={i} className="shortcut-row">
                  <span className="shortcut-label">{s.label}</span>
                  <kbd className="shortcut-key">{formatKey(s)}</kbd>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="shortcut-footer">
          Press <kbd>?</kbd> to close
        </div>
      </div>
    </div>
  );
}
