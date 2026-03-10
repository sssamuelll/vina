import { useState, useCallback, useRef, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../../store';
import type { InterpolationType } from '../../utils/animation/types';
import {
  setCurrentFrame,
  moveKeyframe,
  removeKeyframe,
  setKeyframeInterpolation,
} from '../../store/animationSlice';

const INTERP_OPTIONS: InterpolationType[] = ['linear', 'easeIn', 'easeOut', 'easeInOut', 'bezier'];
const PX_PER_FRAME = 8;

interface ContextMenu {
  x: number; y: number;
  trackId: string; propertyId: string; frame: number;
  currentInterp: InterpolationType;
}

interface KeyframeAreaProps {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onScroll: (e: React.UIEvent) => void;
}

export default function KeyframeArea({ scrollRef, onScroll }: KeyframeAreaProps) {
  const dispatch = useDispatch();
  const { tracks, currentFrame, duration, fps } = useSelector((s: RootState) => s.animation);
  const totalFrames = Math.floor(duration * fps);
  const areaWidth = totalFrames * PX_PER_FRAME;

  const [ctxMenu, setCtxMenu] = useState<ContextMenu | null>(null);
  const [drag, setDrag] = useState<{ trackId: string; propertyId: string; fromFrame: number } | null>(null);
  const localRef = useRef<HTMLDivElement | null>(null);

  const setRefs = useCallback((el: HTMLDivElement | null) => {
    localRef.current = el;
    if (scrollRef && 'current' in scrollRef) {
      (scrollRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    }
  }, [scrollRef]);

  const frameFromX = useCallback((clientX: number) => {
    if (!localRef.current) return 0;
    const rect = localRef.current.getBoundingClientRect();
    const x = clientX - rect.left + localRef.current.scrollLeft;
    return Math.max(0, Math.min(totalFrames - 1, Math.round(x / PX_PER_FRAME)));
  }, [totalFrames]);

  const handleLaneClick = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).classList.contains('keyframe-diamond')) return;
    dispatch(setCurrentFrame(frameFromX(e.clientX)));
  }, [dispatch, frameFromX]);

  const handleDiamondMouseDown = useCallback((e: React.MouseEvent, trackId: string, propertyId: string, frame: number) => {
    e.stopPropagation();
    if (e.button !== 2) setDrag({ trackId, propertyId, fromFrame: frame });
  }, []);

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: MouseEvent) => {
      const toFrame = frameFromX(e.clientX);
      if (toFrame !== drag.fromFrame) {
        dispatch(moveKeyframe({ ...drag, toFrame }));
        setDrag({ ...drag, fromFrame: toFrame });
      }
    };
    const onUp = () => setDrag(null);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
  }, [drag, dispatch, frameFromX]);

  const handleContextMenu = useCallback((e: React.MouseEvent, trackId: string, propertyId: string, frame: number, interp: InterpolationType) => {
    e.preventDefault(); e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY, trackId, propertyId, frame, currentInterp: interp });
  }, []);

  // Close context menu on outside click
  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [ctxMenu]);

  // Build rows: one per track header + one per expanded property
  const rows: JSX.Element[] = [];
  for (const track of tracks) {
    rows.push(<div key={`t-${track.id}`} className="keyframe-lane track-lane" onClick={handleLaneClick} />);
    if (track.expanded) {
      for (const prop of track.properties) {
        rows.push(
          <div key={`p-${prop.id}`} className="keyframe-lane" onClick={handleLaneClick}>
            {prop.keyframes.map((kf) => (
              <div
                key={kf.frame}
                className={`keyframe-diamond${drag?.fromFrame === kf.frame && drag.propertyId === prop.id ? ' dragging' : ''}`}
                style={{ left: kf.frame * PX_PER_FRAME }}
                onMouseDown={(e) => handleDiamondMouseDown(e, track.id, prop.id, kf.frame)}
                onContextMenu={(e) => handleContextMenu(e, track.id, prop.id, kf.frame, kf.interpolation)}
              />
            ))}
          </div>,
        );
      }
    }
  }

  return (
    <div className="keyframe-area" ref={setRefs} onScroll={onScroll}>
      <div className="keyframe-area-inner" style={{ width: areaWidth }}>
        {rows}
        <div className="scrubber-line" style={{ left: currentFrame * PX_PER_FRAME }}>
          <div className="scrubber-head" />
        </div>
      </div>

      {ctxMenu && (
        <div className="keyframe-context-menu" style={{ left: ctxMenu.x, top: ctxMenu.y }}>
          {INTERP_OPTIONS.map((interp) => (
            <button
              key={interp}
              className={interp === ctxMenu.currentInterp ? 'active' : ''}
              onClick={() => {
                dispatch(setKeyframeInterpolation({ trackId: ctxMenu.trackId, propertyId: ctxMenu.propertyId, frame: ctxMenu.frame, interpolation: interp }));
                setCtxMenu(null);
              }}
            >
              {interp}
            </button>
          ))}
          <div className="menu-divider" />
          <button
            className="danger"
            onClick={() => {
              dispatch(removeKeyframe({ trackId: ctxMenu.trackId, propertyId: ctxMenu.propertyId, frame: ctxMenu.frame }));
              setCtxMenu(null);
            }}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
