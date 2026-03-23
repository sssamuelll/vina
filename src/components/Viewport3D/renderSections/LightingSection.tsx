import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../../../store';
import {
  addLight,
  removeLight,
  updateLight,
  applyLightPreset,
} from '../../../store/renderSettingsSlice';
import type { LightType } from '../../../store/renderSettingsSlice';
import type { SectionProps } from './types';

export default function LightingSection({ open, onToggle }: SectionProps) {
  const dispatch = useDispatch<AppDispatch>();
  const { lights } = useSelector((s: RootState) => s.renderSettings);

  return (
    <div className="ap-section">
      <button className="ap-section-header" onClick={onToggle}>
        <span className={`ap-chevron ${open ? 'open' : ''}`}>&#9656;</span>
        Lighting
      </button>
      {open && (
        <div className="ap-section-body">
          <div className="ap-btn-row">
            <button className="ap-btn" onClick={() => dispatch(applyLightPreset('studio3Point'))}>
              Studio 3-Point
            </button>
            <button className="ap-btn" onClick={() => dispatch(applyLightPreset('softBox'))}>
              Soft Box
            </button>
            <button className="ap-btn" onClick={() => dispatch(applyLightPreset('dramatic'))}>
              Dramatic
            </button>
            <button className="ap-btn" onClick={() => dispatch(applyLightPreset('natural'))}>
              Natural
            </button>
          </div>

          <button
            className="ap-btn"
            onClick={() => dispatch(addLight())}
            disabled={lights.length >= 4}
          >
            Add Light
          </button>

          {lights.map(light => (
            <div key={light.id} className="render-light-item">
              <div className="render-light-header">
                <div className="render-color-row">
                  <input
                    type="color"
                    value={light.color}
                    onChange={e =>
                      dispatch(updateLight({ id: light.id, changes: { color: e.target.value } }))
                    }
                  />
                  <span style={{ fontSize: 11, color: '#ccc' }}>{light.id}</span>
                </div>
                <button
                  className="ap-btn"
                  style={{ flex: 'none', padding: '1px 6px', fontSize: 10 }}
                  onClick={() => dispatch(removeLight(light.id))}
                  title="Remove light"
                >
                  &times;
                </button>
              </div>

              {/* Type selector */}
              <div>
                <div className="ap-slider-label">
                  <span>Type</span>
                </div>
                <select
                  className="ap-select"
                  value={light.type}
                  onChange={e =>
                    dispatch(updateLight({ id: light.id, changes: { type: e.target.value as LightType } }))
                  }
                >
                  <option value="rect">Area (Rect)</option>
                  <option value="point">Point</option>
                  <option value="directional">Directional</option>
                  <option value="spot">Spot</option>
                </select>
              </div>

              {/* Intensity */}
              <div>
                <div className="ap-slider-label">
                  <span>Intensity</span>
                  <span>{light.intensity.toFixed(1)}</span>
                </div>
                <div className="ap-slider-control">
                  <input
                    type="range"
                    min={0}
                    max={10}
                    step={0.1}
                    value={light.intensity}
                    onChange={e =>
                      dispatch(updateLight({ id: light.id, changes: { intensity: Number(e.target.value) } }))
                    }
                  />
                </div>
              </div>

              {/* Rect-specific: width + height */}
              {light.type === 'rect' && (
                <>
                  <div>
                    <div className="ap-slider-label">
                      <span>Width</span>
                      <span>{(light.width ?? 1).toFixed(1)}</span>
                    </div>
                    <div className="ap-slider-control">
                      <input
                        type="range"
                        min={0.1}
                        max={5}
                        step={0.1}
                        value={light.width ?? 1}
                        onChange={e =>
                          dispatch(updateLight({ id: light.id, changes: { width: Number(e.target.value) } }))
                        }
                      />
                    </div>
                  </div>
                  <div>
                    <div className="ap-slider-label">
                      <span>Height</span>
                      <span>{(light.height ?? 1).toFixed(1)}</span>
                    </div>
                    <div className="ap-slider-control">
                      <input
                        type="range"
                        min={0.1}
                        max={5}
                        step={0.1}
                        value={light.height ?? 1}
                        onChange={e =>
                          dispatch(updateLight({ id: light.id, changes: { height: Number(e.target.value) } }))
                        }
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Spot-specific: angle + penumbra */}
              {light.type === 'spot' && (
                <>
                  <div>
                    <div className="ap-slider-label">
                      <span>Spot Angle</span>
                      <span>{light.spotAngle.toFixed(0)}&deg;</span>
                    </div>
                    <div className="ap-slider-control">
                      <input
                        type="range"
                        min={1}
                        max={90}
                        step={1}
                        value={light.spotAngle}
                        onChange={e =>
                          dispatch(updateLight({ id: light.id, changes: { spotAngle: Number(e.target.value) } }))
                        }
                      />
                    </div>
                  </div>
                  <div>
                    <div className="ap-slider-label">
                      <span>Penumbra</span>
                      <span>{light.spotPenumbra.toFixed(2)}</span>
                    </div>
                    <div className="ap-slider-control">
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={light.spotPenumbra}
                        onChange={e =>
                          dispatch(updateLight({ id: light.id, changes: { spotPenumbra: Number(e.target.value) } }))
                        }
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Shadow toggle for directional / spot */}
              {(light.type === 'directional' || light.type === 'spot') && (
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 11,
                    cursor: 'pointer',
                    opacity: 0.5,
                  }}
                  title="Shadow maps require WebGL fallback mode"
                >
                  <input
                    type="checkbox"
                    checked={light.castShadow}
                    onChange={e =>
                      dispatch(updateLight({ id: light.id, changes: { castShadow: e.target.checked } }))
                    }
                  />
                  Cast Shadow
                </label>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
