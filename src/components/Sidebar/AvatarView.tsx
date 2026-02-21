import { useEffect, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../../store';
import {
  loadProfilesFromStorage, setActiveProfile, addProfile, updateProfile, deleteProfile,
} from '../../store/avatarSlice';
import { updateMeasurements } from '../../store/projectSlice';
import type { AvatarProfile } from '../../utils/avatar/avatarLibrary';
import type { BodyMeasurements } from '../../types/types';

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

export default function AvatarView() {
  const dispatch = useDispatch<AppDispatch>();
  const measurements = useSelector((s: RootState) => s.project.avatar.measurements);
  const profiles = useSelector((s: RootState) => s.avatar.avatarProfiles);
  const activeProfileId = useSelector((s: RootState) => s.avatar.activeProfileId);

  useEffect(() => {
    dispatch(loadProfilesFromStorage());
  }, [dispatch]);

  const handleProfileChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value || null;
    dispatch(setActiveProfile(id));
    if (id) {
      const profile = profiles.find(p => p.id === id);
      if (profile) {
        dispatch(updateMeasurements(profile.measurements));
      }
    }
  }, [dispatch, profiles]);

  const handleMeasurement = useCallback((key: keyof BodyMeasurements, value: number) => {
    dispatch(updateMeasurements({ [key]: value }));
  }, [dispatch]);

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

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h3 style={{ margin: 0 }}>Avatar Profiles</h3>

      <select value={activeProfileId ?? ''} onChange={handleProfileChange} style={{ width: '100%' }}>
        <option value="">— Select Profile —</option>
        {profiles.map(p => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={handleSave} style={{ flex: 1 }}>Save Profile</button>
        <button onClick={handleDelete} style={{ flex: 1 }} disabled={!activeProfileId}>Delete</button>
      </div>

      <h4 style={{ margin: '8px 0 4px' }}>Measurements</h4>
      {SLIDERS.map(({ key, label, min, max }) => {
        const val = (measurements[key] as number) ?? min;
        return (
          <div key={key}>
            <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span>{label}</span>
              <span>{val} cm</span>
            </label>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="range" min={min} max={max} step={1} value={val}
                onChange={e => handleMeasurement(key, Number(e.target.value))}
                style={{ flex: 1 }}
              />
              <input
                type="number" min={min} max={max} step={1} value={val}
                onChange={e => handleMeasurement(key, Number(e.target.value))}
                style={{ width: 50 }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
