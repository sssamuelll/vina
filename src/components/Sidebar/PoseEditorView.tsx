import { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../../store';
import {
  setJointRotation,
  setPreset,
  resetPose,
  mirrorJoint,
  selectJoint,
  toggleIK,
  removeIKTarget,
  POSE_PRESETS,
} from '../../store/avatarSlice';
import './PoseEditorView.css';

const JOINT_GROUPS: { label: string; joints: string[] }[] = [
  { label: 'Torso', joints: ['Spine', 'Spine1', 'Spine2'] },
  { label: 'Head', joints: ['Neck', 'Head'] },
  { label: 'Left Arm', joints: ['LeftShoulder', 'LeftArm', 'LeftForeArm'] },
  { label: 'Right Arm', joints: ['RightShoulder', 'RightArm', 'RightForeArm'] },
  { label: 'Left Leg', joints: ['LeftUpLeg', 'LeftLeg'] },
  { label: 'Right Leg', joints: ['RightUpLeg', 'RightLeg'] },
];

const AXIS_LABELS = ['X', 'Y', 'Z'] as const;
const AXIS_KEYS = ['x', 'y', 'z'] as const;

function JointSliders({ joint }: { joint: string }) {
  const dispatch = useDispatch();
  const rotation = useSelector(
    (s: RootState) => s.avatar.pose.joints[joint]
  ) ?? { x: 0, y: 0, z: 0 };

  const canMirror = joint.startsWith('Left') || joint.startsWith('Right');

  const handleChange = (axis: 'x' | 'y' | 'z', value: number) => {
    dispatch(setJointRotation({ joint, rotation: { ...rotation, [axis]: value } }));
  };

  const handleReset = () => {
    dispatch(setJointRotation({ joint, rotation: { x: 0, y: 0, z: 0 } }));
  };

  return (
    <div className="pose-joint">
      <div className="pose-joint-header">
        <span className="pose-joint-name">{joint}</span>
        <div className="pose-joint-actions">
          {canMirror && (
            <button
              className="pose-btn-small"
              onClick={() => dispatch(mirrorJoint(joint))}
              title="Mirror to opposite side"
            >
              ↔
            </button>
          )}
          <button className="pose-btn-small" onClick={handleReset} title="Reset joint">
            ↺
          </button>
        </div>
      </div>
      {AXIS_KEYS.map((axis, i) => (
        <div className="pose-slider-row" key={axis}>
          <label className="pose-axis-label">{AXIS_LABELS[i]}</label>
          <input
            type="range"
            min={-180}
            max={180}
            value={rotation[axis]}
            onChange={(e) => handleChange(axis, Number(e.target.value))}
            className="pose-slider"
          />
          <span className="pose-value">{rotation[axis]}°</span>
        </div>
      ))}
    </div>
  );
}

export default function PoseEditorView() {
  const dispatch = useDispatch();
  const activePreset = useSelector((s: RootState) => s.avatar.pose.activePreset);
  const selectedJoint = useSelector((s: RootState) => s.avatar.selectedJoint);
  const ikEnabled = useSelector((s: RootState) => s.avatar.pose.ikEnabled);
  const ikTargets = useSelector((s: RootState) => s.avatar.pose.ikTargets);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [slidersCollapsed, setSlidersCollapsed] = useState(true);

  // Auto-expand the group containing the selected joint
  useEffect(() => {
    if (!selectedJoint) return;
    const group = JOINT_GROUPS.find((g) => g.joints.includes(selectedJoint));
    if (group) {
      setCollapsed((prev) => ({ ...prev, [group.label]: false }));
      setSlidersCollapsed(false);
    }
  }, [selectedJoint]);

  const toggleGroup = (label: string) => {
    setCollapsed((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  return (
    <div className="pose-editor">
      {/* Instruction text */}
      <div style={{ padding: '8px 12px', fontSize: '0.8rem', color: '#999', borderBottom: '1px solid #333' }}>
        Click a joint in the 3D view to pose — or use presets below
        {selectedJoint && (
          <div style={{ marginTop: 4, fontSize: '0.9rem', color: '#44ff44', fontWeight: 600 }}>
            Selected: {selectedJoint}
            <button
              className="pose-btn-small"
              style={{ marginLeft: 8 }}
              onClick={() => dispatch(selectJoint(null))}
              title="Deselect joint"
            >
              ×
            </button>
          </div>
        )}
      </div>

      <div className="pose-presets">
        <div className="pose-section-title">Presets</div>
        <div className="pose-preset-buttons">
          {Object.keys(POSE_PRESETS).map((name) => (
            <button
              key={name}
              className={`pose-preset-btn ${activePreset === name ? 'active' : ''}`}
              onClick={() => dispatch(setPreset(name))}
            >
              {name}
            </button>
          ))}
        </div>
        <button className="pose-reset-all" onClick={() => dispatch(resetPose())}>
          Reset All
        </button>
      </div>

      <div className="pose-ik-section">
        <div className="pose-section-title">Inverse Kinematics</div>
        <div className="pose-ik-controls">
          <label className="pose-ik-toggle">
            <input
              type="checkbox"
              checked={ikEnabled}
              onChange={() => dispatch(toggleIK())}
            />
            Enable IK Mode
          </label>
          {ikEnabled && (
            <div className="pose-ik-help">
              <small>Click and drag hands/feet in the 3D view to pose with IK</small>
            </div>
          )}
        </div>
        {ikTargets.length > 0 && (
          <div className="pose-ik-targets">
            <div className="pose-subsection-title">Active Targets</div>
            {ikTargets.map(target => (
              <div key={target.name} className="pose-ik-target">
                <span>{target.name}</span>
                <button 
                  className="pose-btn-small"
                  onClick={() => dispatch(removeIKTarget(target.name))}
                  title="Remove IK target"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="pose-joints">
        <button
          className="pose-group-header"
          onClick={() => setSlidersCollapsed((p) => !p)}
          style={{ borderBottom: '1px solid #333' }}
        >
          <span className={`pose-chevron ${slidersCollapsed ? '' : 'open'}`}>▸</span>
          Joint Sliders
        </button>
        {!slidersCollapsed && JOINT_GROUPS.map((group) => (
          <div className="pose-group" key={group.label}>
            <button
              className="pose-group-header"
              onClick={() => toggleGroup(group.label)}
            >
              <span className={`pose-chevron ${collapsed[group.label] ? '' : 'open'}`}>▸</span>
              {group.label}
            </button>
            {!collapsed[group.label] && (
              <div className="pose-group-body">
                {group.joints.map((j) => (
                  <JointSliders key={j} joint={j} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
