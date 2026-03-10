import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';

const PX_PER_FRAME = 8;

export default function TimelineRuler() {
  const { duration, fps } = useSelector((s: RootState) => s.animation);
  const totalFrames = Math.floor(duration * fps);

  const ticks = useMemo(() => {
    const result: { frame: number; major: boolean; label: string | null }[] = [];
    // Minor ticks every 5 frames, major ticks every fps frames (1 second)
    const minorInterval = 5;
    for (let f = 0; f <= totalFrames; f += minorInterval) {
      const isMajor = f % fps === 0;
      const secs = f / fps;
      result.push({
        frame: f,
        major: isMajor,
        label: isMajor ? `${Math.floor(secs)}s` : null,
      });
    }
    return result;
  }, [totalFrames, fps]);

  return (
    <div className="timeline-ruler">
      <div className="timeline-ruler-spacer" />
      <div className="timeline-ruler-ticks">
        {ticks.map((tick) => (
          <div key={tick.frame}>
            <div
              className={`timeline-ruler-tick${tick.major ? ' major' : ''}`}
              style={{
                left: tick.frame * PX_PER_FRAME,
                height: tick.major ? 10 : 5,
              }}
            />
            {tick.label && (
              <span
                className="timeline-ruler-label"
                style={{ left: tick.frame * PX_PER_FRAME }}
              >
                {tick.label}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
