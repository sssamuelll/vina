import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../../../store';
import {
  setToneMapping,
  setExposure,
  setSamplesPerPixel,
  setDenoiserEnabled,
} from '../../../store/renderSettingsSlice';
import type { ToneMapping } from '../../../store/renderSettingsSlice';
import type { SectionProps } from './types';

export default function RenderQualitySection({ open, onToggle }: SectionProps) {
  const dispatch = useDispatch<AppDispatch>();
  const { toneMapping, exposure, samplesPerPixel, denoiserEnabled } = useSelector(
    (s: RootState) => s.renderSettings,
  );

  return (
    <div className="ap-section">
      <button className="ap-section-header" onClick={onToggle}>
        <span className={`ap-chevron ${open ? 'open' : ''}`}>&#9656;</span>
        Rendering
      </button>
      {open && (
        <div className="ap-section-body">
          <div>
            <div className="ap-slider-label">
              <span>Tone Mapping</span>
            </div>
            <select
              className="ap-select"
              value={toneMapping}
              onChange={e => dispatch(setToneMapping(e.target.value as ToneMapping))}
            >
              <option value="aces">ACES Filmic</option>
              <option value="reinhard">Reinhard</option>
              <option value="linear">Linear</option>
            </select>
          </div>

          <div>
            <div className="ap-slider-label">
              <span>Exposure</span>
              <span>{exposure.toFixed(1)}</span>
            </div>
            <div className="ap-slider-control">
              <input
                type="range"
                min={0.1}
                max={5.0}
                step={0.1}
                value={exposure}
                onChange={e => dispatch(setExposure(Number(e.target.value)))}
              />
              <input
                type="number"
                min={0.1}
                max={5.0}
                step={0.1}
                value={exposure}
                onChange={e => dispatch(setExposure(Number(e.target.value)))}
              />
            </div>
          </div>

          <div>
            <div className="ap-slider-label">
              <span>Export Samples</span>
              <span>{samplesPerPixel}</span>
            </div>
            <div className="ap-slider-control">
              <input
                type="range"
                min={1}
                max={64}
                step={1}
                value={samplesPerPixel}
                onChange={e => dispatch(setSamplesPerPixel(Number(e.target.value)))}
              />
              <input
                type="number"
                min={1}
                max={64}
                step={1}
                value={samplesPerPixel}
                onChange={e => dispatch(setSamplesPerPixel(Number(e.target.value)))}
              />
            </div>
            <div className="ap-hint">Higher = smoother exports, slower render</div>
          </div>

          <label
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer' }}
          >
            <input
              type="checkbox"
              checked={denoiserEnabled}
              onChange={e => dispatch(setDenoiserEnabled(e.target.checked))}
            />
            Export Denoiser
          </label>
        </div>
      )}
    </div>
  );
}
