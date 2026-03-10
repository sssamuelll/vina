import { useState, useCallback, type RefObject, type MutableRefObject } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { ChevronRight, ChevronDown, Camera, User, Wind, Lightbulb, Plus } from 'lucide-react';
import type { RootState } from '../../store';
import type { AnimationTrack } from '../../utils/animation/types';
import { addTrack, toggleTrackExpanded } from '../../store/animationSlice';

const TRACK_ICONS = { camera: Camera, avatar: User, wind: Wind, light: Lightbulb } as const;

const DEFAULT_PROPERTIES: Record<AnimationTrack['objectType'], { path: string; label: string }[]> = {
  camera: [
    { path: 'position.x', label: 'Position X' },
    { path: 'position.y', label: 'Position Y' },
    { path: 'position.z', label: 'Position Z' },
    { path: 'fov', label: 'FOV' },
  ],
  avatar: [
    { path: 'joints.LeftArm.z', label: 'Left Arm Z' },
    { path: 'joints.RightArm.z', label: 'Right Arm Z' },
  ],
  wind: [
    { path: 'force.x', label: 'Force X' },
    { path: 'force.y', label: 'Force Y' },
    { path: 'force.z', label: 'Force Z' },
  ],
  light: [
    { path: 'intensity', label: 'Intensity' },
    { path: 'color.r', label: 'Color R' },
    { path: 'color.g', label: 'Color G' },
  ],
};

const OBJECT_LABELS: Record<AnimationTrack['objectType'], string> = {
  camera: 'Camera', avatar: 'Avatar', wind: 'Wind', light: 'Light',
};

interface TrackListProps {
  scrollRef: RefObject<HTMLDivElement | null>;
  onScroll: (e: React.UIEvent) => void;
}

export default function TrackList({ scrollRef, onScroll }: TrackListProps) {
  const dispatch = useDispatch();
  const tracks = useSelector((s: RootState) => s.animation.tracks);
  const [menuOpen, setMenuOpen] = useState(false);

  const setRef = useCallback((el: HTMLDivElement | null) => {
    if (scrollRef && 'current' in scrollRef) {
      (scrollRef as MutableRefObject<HTMLDivElement | null>).current = el;
    }
  }, [scrollRef]);

  const handleAdd = useCallback((objectType: AnimationTrack['objectType']) => {
    const id = `${objectType}-${Date.now()}`;
    const props = DEFAULT_PROPERTIES[objectType].map((p, i) => ({
      id: `${id}-prop-${i}`,
      path: p.path,
      label: p.label,
      keyframes: [],
    }));
    dispatch(addTrack({
      id,
      objectType,
      objectId: id,
      label: OBJECT_LABELS[objectType],
      expanded: true,
      properties: props,
    }));
    setMenuOpen(false);
  }, [dispatch]);

  return (
    <div className="track-list" ref={setRef} onScroll={onScroll}>
      <div className="track-list-header">
        <span>Tracks</span>
        <div className="track-add-btn">
          <button onClick={() => setMenuOpen(!menuOpen)} title="Add Track">
            <Plus size={14} />
          </button>
          {menuOpen && (
            <div className="track-add-menu">
              {(Object.keys(OBJECT_LABELS) as AnimationTrack['objectType'][]).map((type) => {
                const Icon = TRACK_ICONS[type];
                return (
                  <button key={type} onClick={() => handleAdd(type)}>
                    <Icon size={12} /> {OBJECT_LABELS[type]}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
      {tracks.map((track) => {
        const Icon = TRACK_ICONS[track.objectType];
        return (
          <div key={track.id}>
            <div className="track-row" onClick={() => dispatch(toggleTrackExpanded(track.id))}>
              <span className="track-chevron">
                {track.expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </span>
              <span className="track-icon"><Icon size={12} /></span>
              <span className="track-label">{track.label}</span>
            </div>
            {track.expanded && track.properties.map((prop) => (
              <div key={prop.id} className="track-property-row">
                {prop.label}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
