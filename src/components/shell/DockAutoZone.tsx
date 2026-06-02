import { Pin, Sparkles } from 'lucide-react';
import type { DockSuggestion } from './dockSuggestions';

interface DockAutoZoneProps {
  /** Kept items — shown always, with an unpin (📌) badge. */
  kept: DockSuggestion[];
  /** Stage suggestions (minus the kept), with a keep (✦) badge. */
  suggested: DockSuggestion[];
  onRun: (id: string) => void;
  onPin: (id: string) => void;
  onUnpin: (id: string) => void;
}

/**
 * The dock's kept + auto-suggest zone. Kept items (📌) render first (they have
 * joined the pinned area), then — if any — a separator + "auto" label + the
 * stage suggestions (✦). Each item is an icon button (runs the action) plus a
 * corner badge sub-button (keeps/drops; stopPropagation so it never runs the
 * action). Renders nothing when both lists are empty.
 */
export default function DockAutoZone({ kept, suggested, onRun, onPin, onUnpin }: DockAutoZoneProps) {
  if (kept.length === 0 && suggested.length === 0) return null;

  const renderItem = (s: DockSuggestion, variant: 'kept' | 'suggested') => {
    const Icon = s.icon;
    const BadgeIcon = variant === 'kept' ? Pin : Sparkles;
    return (
      <div key={s.id} className="dock__tool-wrap">
        <button
          type="button"
          className={`dock__tool ${variant === 'suggested' ? 'dock__tool--auto' : ''}`}
          onClick={() => onRun(s.id)}
          title={s.label}
          aria-label={s.label}
        >
          <Icon size={16} />
        </button>
        <button
          type="button"
          className={`dock__badge ${variant === 'kept' ? 'dock__badge--pin' : 'dock__badge--auto'}`}
          onClick={(e) => { e.stopPropagation(); (variant === 'kept' ? onUnpin : onPin)(s.id); }}
          aria-label={`${variant === 'kept' ? 'Unpin' : 'Keep'} ${s.label}`}
        >
          <BadgeIcon size={9} />
        </button>
      </div>
    );
  };

  return (
    <>
      {kept.map((s) => renderItem(s, 'kept'))}
      {suggested.length > 0 && (
        <>
          <div className="dock__sep" />
          <div className="dock__auto-label">auto</div>
          {suggested.map((s) => renderItem(s, 'suggested'))}
        </>
      )}
    </>
  );
}
