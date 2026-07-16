import { useRef, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../../../store';
import {
  setHdriPreset,
  setHdriRotation,
  setHdriCustomUrl,
  HDRI_PRESETS,
} from '../../../store/renderSettingsSlice';
import type { SectionProps } from './types';

export default function EnvironmentSection({ open, onToggle }: SectionProps) {
  const dispatch = useDispatch<AppDispatch>();
  const { hdriPreset, hdriRotation, hdriCustomUrl } = useSelector(
    (s: RootState) => s.renderSettings,
  );

  const hdriInputRef = useRef<HTMLInputElement>(null);

  const handleHdriUpload = useCallback(
    (file: File) => {
      const ext = file.name.toLowerCase().split('.').pop() || '';
      if (!['hdr', 'exr'].includes(ext)) return;
      const url = URL.createObjectURL(file);
      dispatch(setHdriCustomUrl(url));
    },
    [dispatch],
  );

  return (
    <div className="ap-section">
      <button className="ap-section-header" onClick={onToggle}>
        <span className={`ap-chevron ${open ? 'open' : ''}`}>&#9656;</span>
        Entorno
      </button>
      {open && (
        <div className="ap-section-body">
          <div className="render-hdri-grid">
            {HDRI_PRESETS.map(preset => (
              <button
                key={preset.id}
                className={`render-hdri-item ${hdriPreset === preset.id && !hdriCustomUrl ? 'active' : ''}`}
                onClick={() => dispatch(setHdriPreset(preset.id))}
                title={preset.name}
              >
                {preset.name}
              </button>
            ))}
          </div>

          <div>
            <div className="ap-slider-label">
              <span>Rotación</span>
              <span>{hdriRotation}&deg;</span>
            </div>
            <div className="ap-slider-control">
              <input
                type="range"
                min={-180}
                max={180}
                step={1}
                value={hdriRotation}
                onChange={e => dispatch(setHdriRotation(Number(e.target.value)))}
              />
              <input
                type="number"
                min={-180}
                max={180}
                step={1}
                value={hdriRotation}
                onChange={e => dispatch(setHdriRotation(Number(e.target.value)))}
              />
            </div>
          </div>

          <input
            ref={hdriInputRef}
            type="file"
            accept=".hdr,.exr"
            style={{ display: 'none' }}
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) handleHdriUpload(f);
              e.target.value = '';
            }}
          />
          <button className="ap-btn" onClick={() => hdriInputRef.current?.click()}>
            Subir HDRI
          </button>
          {hdriCustomUrl && <div className="ap-hint">HDRI personalizado cargado</div>}
        </div>
      )}
    </div>
  );
}
