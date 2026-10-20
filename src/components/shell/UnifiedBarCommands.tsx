import { useMemo } from 'react';
import { useDispatch } from 'react-redux';
import type { AppDispatch } from '../../store';
import { COMMANDS, COMMAND_CATEGORIES } from './unifiedBarCommandDefs';
import { shortcutLabelFor } from './shortcutDisplay';

function fuzzyMatch(query: string, text: string): boolean {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

interface Props {
  query: string;
  onExecute: () => void;
  onOpenPanel: (name: string) => void;
}

export default function UnifiedBarCommands({ query, onExecute, onOpenPanel }: Props) {
  const dispatch = useDispatch<AppDispatch>();

  const filtered = useMemo(() => {
    if (!query.trim()) return COMMANDS;
    return COMMANDS.filter(c => fuzzyMatch(query, c.name) || fuzzyMatch(query, c.description));
  }, [query]);

  // Grupos por categoría, en el orden del set cerrado (Fase 3): 20 comandos
  // en lista plana eran el flag #1 de carga cognitiva del assessment.
  const groups = useMemo(
    () => COMMAND_CATEGORIES
      .map(cat => ({ cat, cmds: filtered.filter(c => c.category === cat) }))
      .filter(g => g.cmds.length > 0),
    [filtered],
  );

  return (
    <div style={{ padding: 'var(--sp-2)', maxHeight: '50vh', overflowY: 'auto' }}>
      {groups.map(({ cat, cmds }) => (
        <div key={cat}>
          <div style={{
            padding: '6px 12px 2px', fontSize: '10px', letterSpacing: '0.08em',
            textTransform: 'uppercase', color: 'var(--text-tertiary)', fontWeight: 600,
          }}>
            {cat}
          </div>
          {cmds.map(cmd => {
        const Icon = cmd.icon;
        return (
          <button
            key={cmd.id}
            data-command={cmd.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 'var(--sp-2)',
              width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)',
              textAlign: 'left', transition: 'background var(--transition-fast)',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent-subtle)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            onClick={() => { cmd.action(dispatch as AppDispatch, { onOpenPanel }); onExecute(); }}
          >
            <Icon size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <span style={{ fontSize: '14px', color: 'var(--text-primary)' }}>{cmd.name}</span>
            <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginLeft: 'auto' }}>{cmd.description}</span>
            {shortcutLabelFor(cmd.shortcutId) && (
              <span style={{
                fontSize: '10px', color: 'var(--text-tertiary)', background: 'var(--border-subtle)',
                padding: '2px 6px', borderRadius: '3px', border: '1px solid var(--border)', marginLeft: '8px',
              }}>{shortcutLabelFor(cmd.shortcutId)}</span>
            )}
          </button>
        );
          })}
        </div>
      ))}
      {filtered.length === 0 && (
        <div style={{ padding: 'var(--sp-4)', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '14px' }}>
          Ningún comando coincide con «{query}»
        </div>
      )}
    </div>
  );
}
