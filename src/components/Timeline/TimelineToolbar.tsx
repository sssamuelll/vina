import { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Play, Pause, Square, Repeat, Circle, KeyRound, Download } from 'lucide-react';
import type { RootState } from '../../store';
import type { FpsOption } from '../../utils/animation/types';
import {
  setPlaybackState,
  toggleLoop,
  toggleAutoKeying,
  setFps,
  setRecording,
  setCurrentFrame,
} from '../../store/animationSlice';
import ExportDialog from './ExportDialog';

function formatTimecode(frame: number, fps: number): string {
  const totalSeconds = frame / fps;
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export default function TimelineToolbar() {
  const dispatch = useDispatch();
  const { playbackState, loop, autoKeying, fps, currentFrame, duration, recording } =
    useSelector((s: RootState) => s.animation);
  const [exportOpen, setExportOpen] = useState(false);

  const totalFrames = Math.floor(duration * fps);

  const handlePlayPause = () => {
    if (playbackState === 'playing') {
      dispatch(setPlaybackState('paused'));
    } else {
      dispatch(setPlaybackState('playing'));
    }
  };

  const handleStop = () => {
    dispatch(setPlaybackState('stopped'));
    dispatch(setCurrentFrame(0));
  };

  return (
    <div className="timeline-toolbar">
      <div className="timeline-toolbar-group">
        <button onClick={handlePlayPause} title={playbackState === 'playing' ? 'Pause' : 'Play'}>
          {playbackState === 'playing' ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <button onClick={handleStop} title="Stop">
          <Square size={12} />
        </button>
        <button
          onClick={() => dispatch(toggleLoop())}
          className={loop ? 'active' : ''}
          title="Loop"
        >
          <Repeat size={14} />
        </button>
      </div>

      <div className="timeline-toolbar-divider" />

      <span className="timeline-timecode">
        {formatTimecode(currentFrame, fps)} / {formatTimecode(totalFrames, fps)}
      </span>

      <div className="timeline-toolbar-divider" />

      <select
        value={fps}
        onChange={(e) => dispatch(setFps(Number(e.target.value) as FpsOption))}
        title="Framerate"
      >
        <option value={24}>24 fps</option>
        <option value={30}>30 fps</option>
        <option value={60}>60 fps</option>
      </select>

      <div className="timeline-toolbar-divider" />

      <button
        onClick={() => dispatch(setRecording(!recording))}
        className={recording ? 'recording' : ''}
        title={recording ? 'Stop Recording' : 'Record'}
      >
        <Circle size={12} fill={recording ? 'currentColor' : 'none'} />
      </button>

      <button
        onClick={() => dispatch(toggleAutoKeying())}
        className={autoKeying ? 'active' : ''}
        title="Auto-Key"
      >
        <KeyRound size={14} />
      </button>

      <div style={{ flex: 1 }} />

      <button title="Export" onClick={() => setExportOpen(true)}>
        <Download size={14} />
      </button>

      <ExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        renderer={null}
        scene={null}
        camera={null}
        clothMesh={null}
        recorder={null}
      />
    </div>
  );
}
