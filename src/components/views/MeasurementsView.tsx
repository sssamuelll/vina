import { useState, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../../store';
import { updateMeasurements } from '../../store/projectSlice';
import type { BodyMeasurements } from '../../types/types';
import './views.css';

// ─── Measurement Categories ───

interface MeasurementField {
  key: keyof BodyMeasurements;
  label: string;
}

interface MeasurementCategory {
  name: string;
  fields: MeasurementField[];
}

const CATEGORIES: MeasurementCategory[] = [
  {
    name: 'Head & Neck',
    fields: [
      { key: 'neckCirc', label: 'Neck Circumference' },
      { key: 'neckBackHeight', label: 'Neck Back Height' },
    ],
  },
  {
    name: 'Torso',
    fields: [
      { key: 'chest', label: 'Chest' },
      { key: 'highBust', label: 'High Bust' },
      { key: 'lowBust', label: 'Low Bust' },
      { key: 'ribCirc', label: 'Rib Circumference' },
      { key: 'waist', label: 'Waist' },
      { key: 'hips', label: 'Hips' },
      { key: 'highHip', label: 'High Hip' },
      { key: 'shoulder', label: 'Shoulder' },
      { key: 'shoulderWidth', label: 'Shoulder Width' },
      { key: 'bustWidth', label: 'Bust Width' },
      { key: 'waistWidth', label: 'Waist Width' },
      { key: 'hipWidth', label: 'Hip Width' },
      { key: 'neckToWaistFront', label: 'Neck to Waist (Front)' },
      { key: 'neckToWaistBack', label: 'Neck to Waist (Back)' },
      { key: 'shoulderToWaistFront', label: 'Shoulder to Waist (Front)' },
      { key: 'shoulderToWaistBack', label: 'Shoulder to Waist (Back)' },
      { key: 'waistToHipFront', label: 'Waist to Hip (Front)' },
      { key: 'waistToHipBack', label: 'Waist to Hip (Back)' },
      { key: 'crotchLength', label: 'Crotch Length' },
      { key: 'bustPointToBustPoint', label: 'Bust Point to Bust Point' },
      { key: 'bustPointToNeckSide', label: 'Bust Point to Neck Side' },
      { key: 'dartWidthBust', label: 'Dart Width (Bust)' },
      { key: 'dartWidthWaist', label: 'Dart Width (Waist)' },
    ],
  },
  {
    name: 'Arms',
    fields: [
      { key: 'armLength', label: 'Arm Length' },
      { key: 'upperArmCirc', label: 'Upper Arm Circ.' },
      { key: 'elbowCirc', label: 'Elbow Circ.' },
      { key: 'wristCirc', label: 'Wrist Circ.' },
      { key: 'shoulderToElbow', label: 'Shoulder to Elbow' },
      { key: 'elbowToWrist', label: 'Elbow to Wrist' },
      { key: 'armscyeDepth', label: 'Armscye Depth' },
    ],
  },
  {
    name: 'Legs',
    fields: [
      { key: 'inseam', label: 'Inseam' },
      { key: 'thighCirc', label: 'Thigh Circ.' },
      { key: 'kneeCirc', label: 'Knee Circ.' },
      { key: 'calfCirc', label: 'Calf Circ.' },
      { key: 'ankleCirc', label: 'Ankle Circ.' },
      { key: 'waistToKnee', label: 'Waist to Knee' },
      { key: 'waistToFloor', label: 'Waist to Floor' },
      { key: 'kneeHeight', label: 'Knee Height' },
      { key: 'hipHeight', label: 'Hip Height' },
      { key: 'waistHeight', label: 'Waist Height' },
    ],
  },
  {
    name: 'Misc',
    fields: [
      { key: 'height', label: 'Height' },
    ],
  },
];

// ─── Collapsible Section ───

interface SectionProps {
  title: string;
  badge?: string | number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function Section({ title, badge, defaultOpen = false, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="sidebar-section">
      <button className="sidebar-section-header" onClick={() => setOpen(!open)}>
        <span className="sidebar-section-toggle">{open ? '▾' : '▸'}</span>
        <span className="sidebar-section-title">{title}</span>
        {badge != null && <span className="sidebar-section-badge">({badge})</span>}
      </button>
      <div className={`sidebar-section-body${open ? '' : ' collapsed'}`}>
        {children}
      </div>
    </div>
  );
}

// ─── Main Component ───

export default function MeasurementsView() {
  const dispatch = useDispatch();
  const avatar = useSelector((s: RootState) => s.project.avatar);
  const measurements = avatar.measurements;

  const handleChange = useCallback(
    (key: keyof BodyMeasurements, value: number) => {
      dispatch(updateMeasurements({ [key]: value }));
    },
    [dispatch],
  );

  return (
    <div className="sidebar-view">
      <div className="sidebar-view-content">
        {/* Avatar info */}
        <div className="sidebar-section">
          <div className="sidebar-section-body" style={{ paddingTop: 8 }}>
            <div className="sidebar-field-row">
              <span className="sidebar-label">Avatar</span>
              <span style={{ fontSize: 12, color: '#cccccc' }}>{avatar.name}</span>
            </div>
            <div className="sidebar-field-row">
              <span className="sidebar-label">Height</span>
              <span style={{ fontSize: 12, color: '#cccccc' }}>{measurements.height} cm</span>
            </div>
          </div>
        </div>

        {/* Measurement Categories */}
        {CATEGORIES.map(cat => (
          <Section
            key={cat.name}
            title={cat.name}
            badge={cat.fields.length}
            defaultOpen={cat.name === 'Torso'}
          >
            {cat.fields.map(field => {
              const val = measurements[field.key];
              return (
                <div key={field.key} className="sidebar-field-row">
                  <span className="sidebar-label">{field.label}</span>
                  <input
                    type="number"
                    className="sidebar-input sidebar-input-sm"
                    step={0.5}
                    value={val ?? ''}
                    placeholder="—"
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      if (!isNaN(v)) {
                        handleChange(field.key, v);
                      }
                    }}
                  />
                </div>
              );
            })}
          </Section>
        ))}
      </div>
    </div>
  );
}
