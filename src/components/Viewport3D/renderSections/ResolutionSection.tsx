import { useSelector, useDispatch } from 'react-redux';
import { Lock, Unlock } from 'lucide-react';
import type { RootState, AppDispatch } from '../../../store';
import {
  setResolutionPreset,
  setExportWidth,
  setExportHeight,
  setAspectRatioLocked,
} from '../../../store/renderSettingsSlice';
import type { ResolutionPreset } from '../../../store/renderSettingsSlice';
import type { SectionProps } from './types';

const PRESETS: { value: ResolutionPreset; label: string }[] = [
  { value: '1080p',           label: '1080p' },
  { value: '4k',              label: '4K' },
  { value: 'instagram',       label: 'Cuadrado IG' },
  { value: 'instagram-story', label: 'Historia IG' },
  { value: 'custom',          label: 'Personalizada' },
];

export default function ResolutionSection({ open, onToggle }: SectionProps) {
  const dispatch = useDispatch<AppDispatch>();
  const { resolutionPreset, exportWidth, exportHeight, aspectRatioLocked } = useSelector(
    (s: RootState) => s.renderSettings,
  );

  return (
    <div className="ap-section">
      <button className="ap-section-header" onClick={onToggle}>
        <span className={`ap-chevron ${open ? 'open' : ''}`}>&#9656;</span>
        Resolución
      </button>
      {open && (
        <div className="ap-section-body">
          <div className="ap-btn-row" style={{ flexWrap: 'wrap' }}>
            {PRESETS.map(({ value, label }) => (
              <button
                key={value}
                className={`ap-btn ${resolutionPreset === value ? 'active' : ''}`}
                onClick={() => dispatch(setResolutionPreset(value))}
              >
                {label}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>An</label>
            <input
              type="number"
              min={256}
              max={8192}
              step={1}
              value={exportWidth}
              onChange={e => dispatch(setExportWidth(Number(e.target.value)))}
              style={{
                width: 64,
                padding: '2px 4px',
                border: '1px solid var(--border)',
                borderRadius: 3,
                background: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                fontSize: 11,
                textAlign: 'right',
              }}
            />

            <button
              onClick={() => dispatch(setAspectRatioLocked(!aspectRatioLocked))}
              title={aspectRatioLocked ? 'Desbloquear proporción' : 'Bloquear proporción'}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: aspectRatioLocked ? 'var(--accent)' : 'var(--text-tertiary)',
                padding: 2,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {aspectRatioLocked ? <Lock size={12} /> : <Unlock size={12} />}
            </button>

            <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>Al</label>
            <input
              type="number"
              min={256}
              max={8192}
              step={1}
              value={exportHeight}
              onChange={e => dispatch(setExportHeight(Number(e.target.value)))}
              style={{
                width: 64,
                padding: '2px 4px',
                border: '1px solid var(--border)',
                borderRadius: 3,
                background: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                fontSize: 11,
                textAlign: 'right',
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
