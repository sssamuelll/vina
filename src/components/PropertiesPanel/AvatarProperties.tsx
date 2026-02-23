import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../store';
import { updateMeasurements, setAvatarMode, setAvatarModelUrl } from '../../store/projectSlice';
import type { BodyMeasurements } from '../../types/types';
import PropertySection from './PropertySection';

interface AvatarPropertiesProps {
  collapsed: boolean;
  onToggle: (id: string) => void;
}

export default function AvatarProperties({ collapsed, onToggle }: AvatarPropertiesProps) {
  const dispatch = useDispatch();
  const { avatar, avatarMode, avatarModelUrl } = useSelector((s: RootState) => s.project);

  return (
    <PropertySection id="avatar" title="AVATAR" collapsed={collapsed} onToggle={onToggle}>
      <div className="avatar-mode-toggle">
        <button
          className={`mode-btn ${avatarMode === 'dressform' ? 'active' : ''}`}
          onClick={() => dispatch(setAvatarMode('dressform'))}
        >
          Dress Form
        </button>
        <button
          className={`mode-btn ${avatarMode === 'model' ? 'active' : ''}`}
          onClick={() => {
            if (avatarModelUrl) dispatch(setAvatarMode('model'));
          }}
          style={{ opacity: avatarModelUrl ? 1 : 0.4 }}
        >
          3D Model
        </button>
      </div>

      {/* Load GLB/GLTF */}
      <div className="panel-field file-field">
        <label className="file-label">
          Load GLB / GLTF / VRM avatar
        </label>
        <input
          type="file"
          accept=".glb,.gltf,.vrm"
          className="file-input"
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) {
              const url = URL.createObjectURL(file);
              dispatch(setAvatarModelUrl(url));
            }
          }}
        />
        {avatarModelUrl && (
          <span className="file-status">✓ Model loaded</span>
        )}
      </div>

      {/* URL input for remote models */}
      <div className="panel-field url-field">
        <label className="url-label">
          Or paste URL (ReadyPlayerMe, MakeHuman...)
        </label>
        <input
          type="text"
          className="panel-input url-input"
          placeholder="https://...model.glb"
          onKeyDown={e => {
            if (e.key === 'Enter') {
              const url = (e.target as HTMLInputElement).value.trim();
              if (url) dispatch(setAvatarModelUrl(url));
            }
          }}
        />
      </div>

      {/* Measurements (always visible, used for dress form) */}
      {avatarMode === 'dressform' && (
        <div className="measurements-section">
          {(['height', 'chest', 'waist', 'hips', 'shoulder', 'armLength', 'inseam'] as const).map(key => (
            <div className="panel-field" key={key}>
              <label>{key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1')}</label>
              <div className="panel-input-unit">
                <input
                  type="number"
                  className="panel-input narrow"
                  value={avatar.measurements[key]}
                  onChange={e => dispatch(updateMeasurements({ [key]: Number(e.target.value) }))}
                />
                <span className="unit">cm</span>
              </div>
            </div>
          ))}

          {/* Expanded measurement groups */}
          {([
            { label: 'Torso', keys: ['neckCirc', 'highBust', 'lowBust', 'ribCirc', 'highHip'] as const },
            { label: 'Heights', keys: ['neckBackHeight', 'waistHeight', 'hipHeight', 'kneeHeight'] as const },
            { label: 'Widths', keys: ['shoulderWidth', 'bustWidth', 'waistWidth', 'hipWidth'] as const },
            { label: 'Lengths', keys: ['neckToWaistFront', 'neckToWaistBack', 'shoulderToWaistFront', 'shoulderToWaistBack', 'waistToHipFront', 'waistToHipBack', 'waistToKnee', 'waistToFloor', 'crotchLength'] as const },
            { label: 'Arms', keys: ['upperArmCirc', 'elbowCirc', 'wristCirc', 'shoulderToElbow', 'elbowToWrist', 'armscyeDepth'] as const },
            { label: 'Legs', keys: ['thighCirc', 'kneeCirc', 'calfCirc', 'ankleCirc'] as const },
            { label: 'Bust/Dart', keys: ['bustPointToBustPoint', 'bustPointToNeckSide', 'dartWidthBust', 'dartWidthWaist'] as const },
          ] as const).map(group => (
            <details key={group.label} style={{ marginTop: 4 }}>
              <summary style={{ cursor: 'pointer', fontSize: 11, color: '#aaa', userSelect: 'none' }}>{group.label}</summary>
              <div style={{ paddingLeft: 4 }}>
                {group.keys.map(key => {
                  const val = avatar.measurements[key as keyof BodyMeasurements];
                  return (
                    <div className="panel-field" key={key}>
                      <label>{key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}</label>
                      <div className="panel-input-unit">
                        <input
                          type="number"
                          className="panel-input narrow"
                          value={val ?? ''}
                          placeholder="—"
                          onChange={e => {
                            const v = e.target.value;
                            dispatch(updateMeasurements({ [key]: v === '' ? undefined : Number(v) }));
                          }}
                        />
                        <span className="unit">cm</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </details>
          ))}
        </div>
      )}
    </PropertySection>
  );
}
