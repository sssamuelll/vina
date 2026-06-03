import { Pin, Sparkles } from 'lucide-react';
import type { DockSuggestion } from './dockSuggestions';

interface DockAutoZoneProps {
  /** Kept items — shown always. With a 📌 unpin badge in 'subtle'; plain in 'off'. */
  kept: DockSuggestion[];
  /** Stage suggestions (minus the kept), with a keep (✦) badge. Hidden in 'off'. */
  suggested: DockSuggestion[];
  /** Auto-signaling preference. 'off' mutes badges + the "auto" label + suggestions. */
  signaling: 'subtle' | 'off';
  onRun: (id: string) => void;
  onPin: (id: string) => void;
  onUnpin: (id: string) => void;
}

/**
 * The dock's kept + auto-suggest zone. Kept items (📌) render first (they have
 * joined the pinned area), then — if any — a separator + "auto" label + the
 * stage suggestions (✦). Each item is an icon button (runs the action) plus a
 * corner badge sub-button (keeps/drops; stopPropagation so it never runs the
 * action). When signaling is 'off' the layer is muted: kept items render as
 * plain icon buttons (no badge) and no suggestions rise. Renders nothing when
 * there is nothing to show.
 */
export default function DockAutoZone({ kept, suggested, signaling, onRun, onPin, onUnpin }: DockAutoZoneProps) {
  const off = signaling === 'off';
  if (kept.length === 0 && (off || suggested.length === 0)) return null;

  const renderItem = (s: DockSuggestion, variant: 'kept' | 'suggested', withBadge: boolean) => {
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
        {withBadge && (
          <button
            type="button"
            className={`dock__badge ${variant === 'kept' ? 'dock__badge--pin' : 'dock__badge--auto'}`}
            onClick={(e) => { e.stopPropagation(); (variant === 'kept' ? onUnpin : onPin)(s.id); }}
            aria-label={`${variant === 'kept' ? 'Unpin' : 'Keep'} ${s.label}`}
          >
            <BadgeIcon size={9} />
          </button>
        )}
      </div>
    );
  };

  return (
    <>
      {kept.map((s) => renderItem(s, 'kept', !off))}
      {!off && suggested.length > 0 && (
        <>
          <div className="dock__sep" />
          <div className="dock__auto-label">auto</div>
          {suggested.map((s) => renderItem(s, 'suggested', true))}
        </>
      )}
    </>
  );
}
