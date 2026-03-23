import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../../../store';
import { setAvatarRenderStyle } from '../../../store/renderSettingsSlice';
import type { AvatarRenderStyle } from '../../../store/renderSettingsSlice';
import type { SectionProps } from './types';

const AVATAR_STYLES: { value: AvatarRenderStyle; label: string }[] = [
  { value: 'visible',   label: 'Visible' },
  { value: 'xray',      label: 'Transparent' },
  { value: 'wireframe', label: 'Silhouette' },
  { value: 'hidden',    label: 'Hidden' },
];

export default function AvatarStyleSection({ open, onToggle }: SectionProps) {
  const dispatch = useDispatch<AppDispatch>();
  const { avatarRenderStyle } = useSelector((s: RootState) => s.renderSettings);

  return (
    <div className="ap-section">
      <button className="ap-section-header" onClick={onToggle}>
        <span className={`ap-chevron ${open ? 'open' : ''}`}>&#9656;</span>
        Avatar Style
      </button>
      {open && (
        <div className="ap-section-body">
          <div className="ap-mode-toggle">
            {AVATAR_STYLES.map(({ value, label }) => (
              <button
                key={value}
                className={avatarRenderStyle === value ? 'active' : ''}
                onClick={() => dispatch(setAvatarRenderStyle(value))}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
