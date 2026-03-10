import { useRef, useCallback } from 'react';
import TimelineToolbar from './TimelineToolbar';
import TrackList from './TrackList';
import KeyframeArea from './KeyframeArea';
import TimelineRuler from './TimelineRuler';
import './Timeline.css';

export default function Timeline() {
  const trackListRef = useRef<HTMLDivElement | null>(null);
  const keyframeRef = useRef<HTMLDivElement | null>(null);
  const syncing = useRef(false);

  const handleTrackScroll = useCallback((e: React.UIEvent) => {
    if (syncing.current) return;
    syncing.current = true;
    const target = e.currentTarget as HTMLDivElement;
    if (keyframeRef.current) {
      keyframeRef.current.scrollTop = target.scrollTop;
    }
    syncing.current = false;
  }, []);

  const handleKeyframeScroll = useCallback((e: React.UIEvent) => {
    if (syncing.current) return;
    syncing.current = true;
    const target = e.currentTarget as HTMLDivElement;
    if (trackListRef.current) {
      trackListRef.current.scrollTop = target.scrollTop;
    }
    syncing.current = false;
  }, []);

  return (
    <div className="timeline">
      <TimelineToolbar />
      <div className="timeline-body">
        <TrackList scrollRef={trackListRef} onScroll={handleTrackScroll} />
        <KeyframeArea scrollRef={keyframeRef} onScroll={handleKeyframeScroll} />
      </div>
      <TimelineRuler />
    </div>
  );
}
