import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../../../store';
import {
  setBackgroundMode,
  setBackgroundColor,
} from '../../../store/renderSettingsSlice';
import type { BackgroundMode } from '../../../store/renderSettingsSlice';
import type { SectionProps } from './types';

export default function BackgroundSection({ open, onToggle }: SectionProps) {
  const dispatch = useDispatch<AppDispatch>();
  const { backgroundMode, backgroundColor } = useSelector(
    (s: RootState) => s.renderSettings,
  );

  return (
    <div className="ap-section">
      <button className="ap-section-header" onClick={onToggle}>
        <span className={`ap-chevron ${open ? 'open' : ''}`}>&#9656;</span>
        Fondo
      </button>
      {open && (
        <div className="ap-section-body">
          <div className="ap-mode-toggle">
            {([
              ['hdri', 'HDRI'],
              ['solid', 'Sólido'],
              ['transparent', 'Transparente'],
            ] as [BackgroundMode, string][]).map(([mode, label]) => (
              <button
                key={mode}
                className={backgroundMode === mode ? 'active' : ''}
                onClick={() => dispatch(setBackgroundMode(mode))}
              >
                {label}
              </button>
            ))}
          </div>

          {backgroundMode === 'solid' && (
            <div className="render-color-row">
              <input
                type="color"
                value={backgroundColor}
                onChange={e => dispatch(setBackgroundColor(e.target.value))}
              />
              <span style={{ fontSize: 11, color: '#999' }}>{backgroundColor}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
