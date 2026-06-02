import type { DockSuggestion } from './dockSuggestions';

interface DockAutoZoneProps {
  suggestions: DockSuggestion[];
  /** Run a suggestion by id (the container maps id → action). */
  onRun: (id: string) => void;
}

/**
 * The auto-suggest (✦) zone shown below a dock's pinned tools: a separator, a
 * faint "auto" label, and one violet button per stage-suggested tool. Renders
 * nothing when there are no suggestions. Presentational — clicking runs the
 * suggestion (no pin/keep state in this slice).
 */
export default function DockAutoZone({ suggestions, onRun }: DockAutoZoneProps) {
  if (suggestions.length === 0) return null;
  return (
    <>
      <div className="dock__sep" />
      <div className="dock__auto-label">auto</div>
      {suggestions.map(s => {
        const Icon = s.icon;
        return (
          <button
            key={s.id}
            type="button"
            className="dock__tool dock__tool--auto"
            onClick={() => onRun(s.id)}
            title={s.label}
            aria-label={s.label}
          >
            <Icon size={16} />
          </button>
        );
      })}
    </>
  );
}
