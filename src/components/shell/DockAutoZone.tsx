import { Pin, Sparkles } from 'lucide-react';
import type { DockSuggestion } from './dockSuggestions';
import ToolTooltip from './ToolTooltip';

interface DockAutoZoneProps {
  /** Kept items — shown always. With a 📌 unpin badge in 'subtle'; plain in 'off'. */
  kept: DockSuggestion[];
  /** Stage suggestions (minus the kept), with a keep (✦) badge. Hidden in 'off'. */
  suggested: DockSuggestion[];
  /** Auto-signaling preference. 'off' mutes badges + the "auto" label + suggestions. */
  signaling: 'subtle' | 'off';
  /** Which dock this zone lives in — drives the tooltip's canvas-facing side. */
  side: 'left' | 'right';
  onRun: (id: string) => void;
  onPin: (id: string) => void;
  onUnpin: (id: string) => void;
}

/**
 * The dock's kept + auto-suggest zone. Kept items (📌) render first, then — if any
 * and signaling is on — a separator + "auto" label + the stage suggestions (✦).
 * Each item is an icon button (runs the action) plus a corner badge sub-button
 * (keeps/drops; stopPropagation), wrapped in a ToolTooltip whose line-2 explains
 * why the item is here (pinned vs stage-suggested). The tooltip faces the canvas
 * (left dock → right, right dock → left). Renders nothing when there is nothing
 * to show; in 'off' kept items render plain (no badge) but still tooltip.
 */
export default function DockAutoZone({ kept, suggested, signaling, side, onRun, onPin, onUnpin }: DockAutoZoneProps) {
  const off = signaling === 'off';
  if (kept.length === 0 && (off || suggested.length === 0)) return null;

  const tipPosition = side === 'left' ? 'right' : 'left';

  const renderItem = (s: DockSuggestion, variant: 'kept' | 'suggested', withBadge: boolean) => {
    const Icon = s.icon;
    const BadgeIcon = variant === 'kept' ? Pin : Sparkles;
    const description = variant === 'kept'
      ? 'you pinned this'
      : 'suggested for this stage · click ✦ to keep';
    const tone: 'pin' | 'auto' = variant === 'kept' ? 'pin' : 'auto';
    return (
      <ToolTooltip key={s.id} name={s.label} description={description} descriptionTone={tone} position={tipPosition}>
        <div className="dock__tool-wrap">
          <button
            type="button"
            className={`dock__tool ${variant === 'suggested' ? 'dock__tool--auto' : ''}`}
            onClick={() => onRun(s.id)}
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
      </ToolTooltip>
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
