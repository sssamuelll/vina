/**
 * ShortcutHelp — ? key overlay showing all keyboard shortcuts.
 * Grouped by category, CLO3D-style.
 *
 * Now reads shortcut definitions from the centralized ShortcutRegistry
 * and registers its toggle/close via useShortcut.
 */

import { useState, useCallback } from 'react';
import { X } from 'lucide-react';
import { useShortcut, useShortcutRegistry } from '../../shortcuts';
import type { ShortcutDef } from '../../shortcuts';
import './ShortcutHelp.css';

function formatKey(entry: ShortcutDef): string {
  const parts: string[] = [];
  if (entry.ctrl) parts.push('Ctrl');
  if (entry.shift) parts.push('Shift');
  if (entry.alt) parts.push('Alt');
  parts.push(entry.key);
  return parts.join('+');
}

export default function ShortcutHelp() {
  const [visible, setVisible] = useState(false);
  const registry = useShortcutRegistry();

  const toggleHelp = useCallback(() => setVisible(v => !v), []);
  const closeHelp = useCallback(() => { if (visible) setVisible(false); }, [visible]);

  useShortcut('view.helpOverlay', toggleHelp);
  useShortcut('view.helpOverlayAlt', toggleHelp);

  // Escape to close is handled by the global 'selection.deselect' shortcut,
  // but we also want it to close the help overlay when visible
  useShortcut('selection.deselect', closeHelp);

  if (!visible) return null;

  const shortcuts = registry?.getAllDefs() ?? [];
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
