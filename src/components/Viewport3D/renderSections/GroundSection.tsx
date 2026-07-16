import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../../../store';
import {
  setGroundVisible,
  setShadowOpacity,
  setShadowBlur,
} from '../../../store/renderSettingsSlice';
import type { SectionProps } from './types';

export default function GroundSection({ open, onToggle }: SectionProps) {
  const dispatch = useDispatch<AppDispatch>();
  const { groundVisible, shadowOpacity, shadowBlur } = useSelector(
    (s: RootState) => s.renderSettings,
  );

  return (
    <div className="ap-section">
      <button className="ap-section-header" onClick={onToggle}>
        <span className={`ap-chevron ${open ? 'open' : ''}`}>&#9656;</span>
        Suelo
      </button>
      {open && (
        <div className="ap-section-body">
          <label
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer' }}
          >
            <input
              type="checkbox"
              checked={groundVisible}
              onChange={e => dispatch(setGroundVisible(e.target.checked))}
            />
            Visible
          </label>

          <div>
            <div className="ap-slider-label">
              <span>Opacidad de sombra</span>
              <span>{shadowOpacity.toFixed(2)}</span>
            </div>
            <div className="ap-slider-control">
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={shadowOpacity}
                onChange={e => dispatch(setShadowOpacity(Number(e.target.value)))}
              />
              <input
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={shadowOpacity}
                onChange={e => dispatch(setShadowOpacity(Number(e.target.value)))}
              />
            </div>
          </div>

          <div>
            <div className="ap-slider-label">
              <span>Difuminado de sombra</span>
              <span>{shadowBlur.toFixed(1)}</span>
            </div>
            <div className="ap-slider-control">
              <input
                type="range"
                min={0}
                max={5}
                step={0.1}
                value={shadowBlur}
                onChange={e => dispatch(setShadowBlur(Number(e.target.value)))}
              />
              <input
                type="number"
                min={0}
                max={5}
                step={0.1}
                value={shadowBlur}
                onChange={e => dispatch(setShadowBlur(Number(e.target.value)))}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
