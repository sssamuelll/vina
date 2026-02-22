import { useState, useEffect, useCallback, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../../store';
import {
  setPreset, resetPose, selectJoint, setJointRotation, mirrorJoint,
  POSE_PRESETS, JOINT_CONSTRAINTS,
  loadProfilesFromStorage, setActiveProfile, addProfile, updateProfile, deleteProfile,
} from '../../store/avatarSlice';
import {
  setAvatarModelUrl, setAvatarMode, updateMeasurements,
} from '../../store/projectSlice';
import type { AvatarProfile } from '../../utils/avatar/avatarLibrary';
import type { BodyMeasurements } from '../../types/types';
import type { AvatarMode } from '../../store/projectSlice';
import './AvatarPanel.css';

interface SliderDef {
  key: keyof BodyMeasurements;
  label: string;
  min: number;
  max: number;
}

const SLIDERS: SliderDef[] = [
  { key: 'height', label: 'Height', min: 140, max: 210 },
  { key: 'chest', label: 'Chest', min: 70, max: 130 },
  { key: 'waist', label: 'Waist', min: 55, max: 120 },
  { key: 'hips', label: 'Hip', min: 70, max: 130 },
  { key: 'shoulder', label: 'Shoulder Width', min: 35, max: 55 },
  { key: 'armLength', label: 'Arm Length', min: 50, max: 75 },
  { key: 'inseam', label: 'Inseam', min: 65, max: 90 },
];

const AXIS_LABELS = ['X', 'Y', 'Z'] as const;
const AXIS_KEYS = ['x', 'y', 'z'] as const;

interface AvatarPanelProps {
  open: boolean;
  onClose: () => void;
}

export default function AvatarPanel({ open, onClose }: AvatarPanelProps) {
  const dispatch = useDispatch<AppDispatch>();

  // Avatar state
  const measurements = useSelector((s: RootState) => s.project.avatar.measurements);
  const profiles = useSelector((s: RootState) => s.avatar.avatarProfiles);
  const activeProfileId = useSelector((s: RootState) => s.avatar.activeProfileId);
  const avatarMode = useSelector((s: RootState) => s.project.avatarMode);
  const avatarModelUrl = useSelector((s: RootState) => s.project.avatarModelUrl);

  // Pose state
  const activePreset = useSelector((s: RootState) => s.avatar.pose.activePreset);
  const selectedJoint = useSelector((s: RootState) => s.avatar.selectedJoint);
  const jointRotation = useSelector(
    (s: RootState) => selectedJoint ? s.avatar.pose.joints[selectedJoint] : null
  ) ?? { x: 0, y: 0, z: 0 };

  // Section collapse
  const [avatarOpen, setAvatarOpen] = useState(true);
  const [poseOpen, setPoseOpen] = useState(true);
  const [jointDetailsOpen, setJointDetailsOpen] = useState(true);

  // File input ref
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragover, setDragover] = useState(false);
  const [modelName, setModelName] = useState<string | null>(null);

  useEffect(() => {
    dispatch(loadProfilesFromStorage());
  }, [dispatch]);

  // Derive model name
  useEffect(() => {
    if (!avatarModelUrl || avatarModelUrl === '/default-avatar.glb') {
      setModelName(null);
    }
  }, [avatarModelUrl]);

  // GLB upload
  const handleFileUpload = useCallback((file: File) => {
    if (!file.name.endsWith('.glb')) return;
    const url = URL.createObjectURL(file);
    dispatch(setAvatarModelUrl(url));
    setModelName(file.name);
  }, [dispatch]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragover(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  }, [handleFileUpload]);

  // Profile handlers
  const handleProfileChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value || null;
    dispatch(setActiveProfile(id));
    if (id) {
      const profile = profiles.find(p => p.id === id);
      if (profile) dispatch(updateMeasurements(profile.measurements));
    }
  }, [dispatch, profiles]);

  const handleSave = useCallback(() => {
    const name = prompt('Profile name:');
    if (!name) return;
    const now = Date.now();
    const profile: AvatarProfile = {
      id: activeProfileId ?? `profile-${now}`,
      name,
      measurements: { ...measurements },
      createdAt: now,
      updatedAt: now,
    };
    if (activeProfileId && profiles.find(p => p.id === activeProfileId)) {
      dispatch(updateProfile(profile));
    } else {
      dispatch(addProfile(profile));
      dispatch(setActiveProfile(profile.id));
    }
  }, [dispatch, measurements, activeProfileId, profiles]);

  const handleDelete = useCallback(() => {
    if (!activeProfileId) return;
    if (!confirm('Delete this profile?')) return;
    dispatch(deleteProfile(activeProfileId));
  }, [dispatch, activeProfileId]);

  const handleMeasurement = useCallback((key: keyof BodyMeasurements, value: number) => {
    dispatch(updateMeasurements({ [key]: value }));
  }, [dispatch]);

  // Joint rotation handler
  const handleJointChange = useCallback((axis: 'x' | 'y' | 'z', value: number) => {
    if (!selectedJoint) return;
    dispatch(setJointRotation({ joint: selectedJoint, rotation: { ...jointRotation, [axis]: value } }));
  }, [dispatch, selectedJoint, jointRotation]);

  const constraints = selectedJoint ? JOINT_CONSTRAINTS[selectedJoint] : null;
  const canMirror = selectedJoint ? (selectedJoint.startsWith('Left') || selectedJoint.startsWith('Right')) : false;

  return (
    <div className="avatar-panel-wrapper">
      <div className={`avatar-panel ${open ? '' : 'hidden'}`}>
        <div className="avatar-panel-header">
          <h3>Avatar & Pose</h3>
          <button className="avatar-panel-close" onClick={onClose} title="Close">×</button>
        </div>

        <div className="avatar-panel-scroll">
          {/* ── Avatar Section ── */}
          <div className="ap-section">
            <button className="ap-section-header" onClick={() => setAvatarOpen(!avatarOpen)}>
              <span className={`ap-chevron ${avatarOpen ? 'open' : ''}`}>▸</span>
              Avatar
            </button>
            {avatarOpen && (
              <div className="ap-section-body">
                {/* GLB loader */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".glb"
                  style={{ display: 'none' }}
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) handleFileUpload(f);
                  }}
                />
                <div
                  className={`ap-dropzone ${dragover ? 'dragover' : ''}`}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); setDragover(true); }}
                  onDragLeave={() => setDragover(false)}
                  onDrop={handleDrop}
                >
                  📁 Drop .glb file or click to upload
                </div>
                <div className="ap-model-info">
                  <span>{modelName ?? 'Default Avatar'}</span>
                  {modelName && (
                    <button
                      className="ap-btn"
                      style={{ flex: 'none', padding: '2px 8px' }}
                      onClick={() => {
                        dispatch(setAvatarModelUrl('/default-avatar.glb'));
                        setModelName(null);
                      }}
                    >
                      Reset
                    </button>
                  )}
                </div>

                {/* Avatar Mode */}
                <div className="ap-mode-toggle">
                  <button
                    className={avatarMode === 'model' ? 'active' : ''}
                    onClick={() => dispatch(setAvatarMode('model' as AvatarMode))}
                  >
                    Model
                  </button>
                  <button
                    className={avatarMode === 'dressform' ? 'active' : ''}
                    onClick={() => dispatch(setAvatarMode('dressform' as AvatarMode))}
                  >
                    Dress Form
                  </button>
                </div>

                {/* Profiles */}
                <select className="ap-select" value={activeProfileId ?? ''} onChange={handleProfileChange}>
                  <option value="">— Select Profile —</option>
                  {profiles.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <div className="ap-btn-row">
                  <button className="ap-btn" onClick={handleSave}>Save Profile</button>
                  <button className="ap-btn" onClick={handleDelete} disabled={!activeProfileId}>Delete</button>
                </div>

                {/* Measurements */}
                <div className="ap-slider-group">
                  {SLIDERS.map(({ key, label, min, max }) => {
                    const val = (measurements[key] as number) ?? min;
                    return (
                      <div key={key}>
                        <div className="ap-slider-label">
                          <span>{label}</span>
                          <span>{val} cm</span>
                        </div>
                        <div className="ap-slider-control">
                          <input
                            type="range" min={min} max={max} step={1} value={val}
                            onChange={e => handleMeasurement(key, Number(e.target.value))}
                          />
                          <input
                            type="number" min={min} max={max} step={1} value={val}
                            onChange={e => handleMeasurement(key, Number(e.target.value))}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* ── Pose Section ── */}
          <div className="ap-section">
            <button className="ap-section-header" onClick={() => setPoseOpen(!poseOpen)}>
              <span className={`ap-chevron ${poseOpen ? 'open' : ''}`}>▸</span>
              Pose
            </button>
            {poseOpen && (
              <div className="ap-section-body">
                {/* Presets */}
                <div className="ap-preset-row">
                  {Object.keys(POSE_PRESETS).map(name => (
                    <button
                      key={name}
                      className={`ap-preset-btn ${activePreset === name ? 'active' : ''}`}
                      onClick={() => dispatch(setPreset(name))}
                    >
                      {name}
                    </button>
                  ))}
                </div>
                <button className="ap-btn" onClick={() => dispatch(resetPose())}>Reset All</button>

                <div className="ap-hint">Click joints in 3D to pose</div>

                {/* Selected joint */}
                {selectedJoint ? (
                  <>
                    <div className="ap-joint-info">
                      Selected: {selectedJoint}
                      <button
                        className="ap-btn"
                        style={{ flex: 'none', marginLeft: 8, padding: '1px 6px', fontSize: 10 }}
                        onClick={() => dispatch(selectJoint(null))}
                      >
                        ×
                      </button>
                      {canMirror && (
                        <button
                          className="ap-btn"
                          style={{ flex: 'none', marginLeft: 4, padding: '1px 6px', fontSize: 10 }}
                          onClick={() => dispatch(mirrorJoint(selectedJoint))}
                          title="Mirror to opposite side"
                        >
                          ↔
                        </button>
                      )}
                    </div>

                    {/* Joint Details */}
                    <div className="ap-section" style={{ border: 'none', padding: 0 }}>
                      <button
                        className="ap-section-header"
                        style={{ padding: '4px 0' }}
                        onClick={() => setJointDetailsOpen(!jointDetailsOpen)}
                      >
                        <span className={`ap-chevron ${jointDetailsOpen ? 'open' : ''}`}>▸</span>
                        Joint Details
                      </button>
                      {jointDetailsOpen && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {AXIS_KEYS.map((axis, i) => {
                            const min = constraints ? constraints[`min${AXIS_LABELS[i]}` as keyof typeof constraints] : -180;
                            const max = constraints ? constraints[`max${AXIS_LABELS[i]}` as keyof typeof constraints] : 180;
                            return (
                              <div className="ap-joint-axis" key={axis}>
                                <label>{AXIS_LABELS[i]}</label>
                                <input
                                  type="range"
                                  min={min} max={max}
                                  value={jointRotation[axis]}
                                  onChange={e => handleJointChange(axis, Number(e.target.value))}
                                  style={{ flex: 1, height: 4, appearance: 'none', background: 'var(--border-color, #444)', borderRadius: 2 }}
                                />
                                <span>{jointRotation[axis]}°</span>
                              </div>
                            );
                          })}
                          <button
                            className="ap-btn"
                            style={{ alignSelf: 'flex-start', padding: '2px 8px', fontSize: 10 }}
                            onClick={() => dispatch(setJointRotation({ joint: selectedJoint, rotation: { x: 0, y: 0, z: 0 } }))}
                          >
                            Reset Joint
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="ap-hint">No joint selected</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
