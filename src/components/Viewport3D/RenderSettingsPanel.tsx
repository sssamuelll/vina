import { useState, useRef, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../../store';
import {
  setHdriPreset,
  setHdriRotation,
  setHdriCustomUrl,
  setToneMapping,
  setExposure,
  setBackgroundMode,
  setBackgroundColor,
  addLight,
  removeLight,
  updateLight,
  applyLightPreset,
  setGroundVisible,
  setShadowOpacity,
  setShadowBlur,
  setTurntableFrameCount,
  setTurntableDirection,
  HDRI_PRESETS,
} from '../../store/renderSettingsSlice';
import type { ToneMapping, BackgroundMode } from '../../store/renderSettingsSlice';
import './RenderSettingsPanel.css';

interface RenderSettingsPanelProps {
  open: boolean;
  onClose: () => void;
  onExportStill?: (w: number, h: number, transparent: boolean) => void;
  onExportTurntable?: () => void;
  onExportAllViews?: (w: number, h: number, transparent: boolean) => void;
  onExport3D?: (format: '3d-glb' | '3d-gltf' | '3d-usdz', includeAvatar: boolean, scale: number) => void;
}

export default function RenderSettingsPanel({
  open,
  onClose,
  onExportStill,
  onExportTurntable,
  onExportAllViews,
  onExport3D,
}: RenderSettingsPanelProps) {
  const dispatch = useDispatch<AppDispatch>();

  // Redux state
  const {
    hdriPreset,
    hdriRotation,
    hdriCustomUrl,
    toneMapping,
    exposure,
    backgroundMode,
    backgroundColor,
    lights,
    groundVisible,
    shadowOpacity,
    shadowBlur,
    turntableFrameCount,
    turntableDirection,
  } = useSelector((s: RootState) => s.renderSettings);

  // Section collapse state
  const [envOpen, setEnvOpen] = useState(true);
  const [renderingOpen, setRenderingOpen] = useState(true);
  const [bgOpen, setBgOpen] = useState(true);
  const [groundOpen, setGroundOpen] = useState(true);
  const [lightingOpen, setLightingOpen] = useState(true);
  const [exportOpen, setExportOpen] = useState(true);

  // Export settings (local state)
  const [exportWidth, setExportWidth] = useState(2048);
  const [exportHeight, setExportHeight] = useState(2048);
  const [exportTransparent, setExportTransparent] = useState(false);
  const [export3DFormat, setExport3DFormat] = useState<'3d-glb' | '3d-gltf' | '3d-usdz'>('3d-glb');
  const [export3DIncludeAvatar, setExport3DIncludeAvatar] = useState(true);
  const [export3DScale, setExport3DScale] = useState(0.001); // mm → m

  // HDRI file input ref
  const hdriInputRef = useRef<HTMLInputElement>(null);

  const handleHdriUpload = useCallback((file: File) => {
    const ext = file.name.toLowerCase().split('.').pop() || '';
    if (!['hdr', 'exr'].includes(ext)) return;
    const url = URL.createObjectURL(file);
    dispatch(setHdriCustomUrl(url));
  }, [dispatch]);

  if (!open) return null;

  return (
    <div className="render-panel-wrapper">
      <div className="render-panel">
        <div className="render-panel-header">
          <h3>Render Settings</h3>
          <button className="render-panel-close" onClick={onClose} title="Close">&times;</button>
        </div>

        <div className="render-panel-scroll">
          {/* ── Environment Section ── */}
          <div className="ap-section">
            <button className="ap-section-header" onClick={() => setEnvOpen(!envOpen)}>
              <span className={`ap-chevron ${envOpen ? 'open' : ''}`}>&#9656;</span>
              Environment
            </button>
            {envOpen && (
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
                    <span>Rotation</span>
                    <span>{hdriRotation}&deg;</span>
                  </div>
                  <div className="ap-slider-control">
                    <input
                      type="range" min={-180} max={180} step={1} value={hdriRotation}
                      onChange={e => dispatch(setHdriRotation(Number(e.target.value)))}
                    />
                    <input
                      type="number" min={-180} max={180} step={1} value={hdriRotation}
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
                <button
                  className="ap-btn"
                  onClick={() => hdriInputRef.current?.click()}
                >
                  Upload HDRI
                </button>
                {hdriCustomUrl && (
                  <div className="ap-hint">Custom HDRI loaded</div>
                )}
              </div>
            )}
          </div>

          {/* ── Rendering Section ── */}
          <div className="ap-section">
            <button className="ap-section-header" onClick={() => setRenderingOpen(!renderingOpen)}>
              <span className={`ap-chevron ${renderingOpen ? 'open' : ''}`}>&#9656;</span>
              Rendering
            </button>
            {renderingOpen && (
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
                      type="range" min={0.1} max={5.0} step={0.1} value={exposure}
                      onChange={e => dispatch(setExposure(Number(e.target.value)))}
                    />
                    <input
                      type="number" min={0.1} max={5.0} step={0.1} value={exposure}
                      onChange={e => dispatch(setExposure(Number(e.target.value)))}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Background Section ── */}
          <div className="ap-section">
            <button className="ap-section-header" onClick={() => setBgOpen(!bgOpen)}>
              <span className={`ap-chevron ${bgOpen ? 'open' : ''}`}>&#9656;</span>
              Background
            </button>
            {bgOpen && (
              <div className="ap-section-body">
                <div className="ap-mode-toggle">
                  {(['hdri', 'solid', 'transparent'] as BackgroundMode[]).map(mode => (
                    <button
                      key={mode}
                      className={backgroundMode === mode ? 'active' : ''}
                      onClick={() => dispatch(setBackgroundMode(mode))}
                    >
                      {mode.charAt(0).toUpperCase() + mode.slice(1)}
                    </button>
                  ))}
                </div>

                {backgroundMode === 'solid' && (
                  <div className="render-color-row">
                    <input
                      type="color"
                      value={backgroundColor}
                      onChange={e => dispatch(setBackgroundColor(e.target.value))}
                    />
                    <span style={{ fontSize: 11, color: '#999' }}>{backgroundColor}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Ground Section ── */}
          <div className="ap-section">
            <button className="ap-section-header" onClick={() => setGroundOpen(!groundOpen)}>
              <span className={`ap-chevron ${groundOpen ? 'open' : ''}`}>&#9656;</span>
              Ground
            </button>
            {groundOpen && (
              <div className="ap-section-body">
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={groundVisible}
                    onChange={e => dispatch(setGroundVisible(e.target.checked))}
                  />
                  Visible
                </label>

                <div>
                  <div className="ap-slider-label">
                    <span>Shadow Opacity</span>
                    <span>{shadowOpacity.toFixed(2)}</span>
                  </div>
                  <div className="ap-slider-control">
                    <input
                      type="range" min={0} max={1} step={0.05} value={shadowOpacity}
                      onChange={e => dispatch(setShadowOpacity(Number(e.target.value)))}
                    />
                    <input
                      type="number" min={0} max={1} step={0.05} value={shadowOpacity}
                      onChange={e => dispatch(setShadowOpacity(Number(e.target.value)))}
                    />
                  </div>
                </div>

                <div>
                  <div className="ap-slider-label">
                    <span>Shadow Blur</span>
                    <span>{shadowBlur.toFixed(1)}</span>
                  </div>
                  <div className="ap-slider-control">
                    <input
                      type="range" min={0} max={5} step={0.1} value={shadowBlur}
                      onChange={e => dispatch(setShadowBlur(Number(e.target.value)))}
                    />
                    <input
                      type="number" min={0} max={5} step={0.1} value={shadowBlur}
                      onChange={e => dispatch(setShadowBlur(Number(e.target.value)))}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Lighting Section ── */}
          <div className="ap-section">
            <button className="ap-section-header" onClick={() => setLightingOpen(!lightingOpen)}>
              <span className={`ap-chevron ${lightingOpen ? 'open' : ''}`}>&#9656;</span>
              Lighting
            </button>
            {lightingOpen && (
              <div className="ap-section-body">
                <div className="ap-btn-row">
                  <button className="ap-btn" onClick={() => dispatch(applyLightPreset('studio3Point'))}>Studio 3-Point</button>
                  <button className="ap-btn" onClick={() => dispatch(applyLightPreset('softBox'))}>Soft Box</button>
                  <button className="ap-btn" onClick={() => dispatch(applyLightPreset('dramatic'))}>Dramatic</button>
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
                          onChange={e => dispatch(updateLight({ id: light.id, changes: { color: e.target.value } }))}
                        />
                        <span>{light.id}</span>
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

                    <div>
                      <div className="ap-slider-label">
                        <span>Intensity</span>
                        <span>{light.intensity.toFixed(1)}</span>
                      </div>
                      <div className="ap-slider-control">
                        <input
                          type="range" min={0} max={10} step={0.1} value={light.intensity}
                          onChange={e => dispatch(updateLight({ id: light.id, changes: { intensity: Number(e.target.value) } }))}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="ap-slider-label">
                        <span>Width</span>
                        <span>{(light.width ?? 1).toFixed(1)}</span>
                      </div>
                      <div className="ap-slider-control">
                        <input
                          type="range" min={0.1} max={5} step={0.1} value={light.width ?? 1}
                          onChange={e => dispatch(updateLight({ id: light.id, changes: { width: Number(e.target.value) } }))}
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
                          type="range" min={0.1} max={5} step={0.1} value={light.height ?? 1}
                          onChange={e => dispatch(updateLight({ id: light.id, changes: { height: Number(e.target.value) } }))}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Export Section ── */}
          <div className="ap-section">
            <button className="ap-section-header" onClick={() => setExportOpen(!exportOpen)}>
              <span className={`ap-chevron ${exportOpen ? 'open' : ''}`}>&#9656;</span>
              Export
            </button>
            {exportOpen && (
              <div className="ap-section-body">
                {/* Still Export */}
                <div style={{ fontSize: 11, fontWeight: 600, color: '#999', marginBottom: 2 }}>Still</div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <label style={{ fontSize: 10, color: '#888' }}>W</label>
                  <input
                    type="number" min={256} max={8192} step={1} value={exportWidth}
                    onChange={e => setExportWidth(Number(e.target.value))}
                    style={{
                      width: 60, padding: '2px 4px', border: '1px solid var(--border-color, #444)',
                      borderRadius: 3, background: 'var(--bg-secondary, #2a2a2a)', color: '#ccc',
                      fontSize: 10, textAlign: 'right',
                    }}
                  />
                  <label style={{ fontSize: 10, color: '#888' }}>H</label>
                  <input
                    type="number" min={256} max={8192} step={1} value={exportHeight}
                    onChange={e => setExportHeight(Number(e.target.value))}
                    style={{
                      width: 60, padding: '2px 4px', border: '1px solid var(--border-color, #444)',
                      borderRadius: 3, background: 'var(--bg-secondary, #2a2a2a)', color: '#ccc',
                      fontSize: 10, textAlign: 'right',
                    }}
                  />
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={exportTransparent}
                    onChange={e => setExportTransparent(e.target.checked)}
                  />
                  Transparent background
                </label>
                <button
                  className="ap-btn accent"
                  disabled={!onExportStill}
                  onClick={() => onExportStill?.(exportWidth, exportHeight, exportTransparent)}
                >
                  Export Still
                </button>

                {/* Turntable Export */}
                <div style={{ fontSize: 11, fontWeight: 600, color: '#999', marginTop: 8, marginBottom: 2 }}>Turntable</div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <label style={{ fontSize: 10, color: '#888' }}>Frames</label>
                  <select
                    className="ap-select"
                    style={{ width: 'auto' }}
                    value={turntableFrameCount}
                    onChange={e => dispatch(setTurntableFrameCount(Number(e.target.value)))}
                  >
                    <option value={12}>12</option>
                    <option value={24}>24</option>
                    <option value={36}>36</option>
                    <option value={72}>72</option>
                  </select>
                  <div className="ap-mode-toggle" style={{ flex: 1 }}>
                    <button
                      className={turntableDirection === 'cw' ? 'active' : ''}
                      onClick={() => dispatch(setTurntableDirection('cw'))}
                    >
                      CW
                    </button>
                    <button
                      className={turntableDirection === 'ccw' ? 'active' : ''}
                      onClick={() => dispatch(setTurntableDirection('ccw'))}
                    >
                      CCW
                    </button>
                  </div>
                </div>
                <button
                  className="ap-btn accent"
                  disabled={!onExportTurntable}
                  onClick={() => onExportTurntable?.()}
                >
                  Render Turntable
                </button>

                {/* Batch Export */}
                <div style={{ fontSize: 11, fontWeight: 600, color: '#999', marginTop: 8, marginBottom: 2 }}>Batch</div>
                <button
                  className="ap-btn accent"
                  disabled={!onExportAllViews}
                  onClick={() => onExportAllViews?.(exportWidth, exportHeight, exportTransparent)}
                >
                  Export All Views
                </button>

                {/* 3D Model Export */}
                <div style={{ fontSize: 11, fontWeight: 600, color: '#999', marginTop: 8, marginBottom: 2 }}>3D Model</div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <label style={{ fontSize: 10, color: '#888' }}>Format</label>
                  <select
                    className="ap-select"
                    style={{ width: 'auto' }}
                    value={export3DFormat}
                    onChange={e => setExport3DFormat(e.target.value as '3d-glb' | '3d-gltf' | '3d-usdz')}
                  >
                    <option value="3d-glb">GLB</option>
                    <option value="3d-gltf">glTF</option>
                    <option value="3d-usdz">USDZ</option>
                  </select>
                  <label style={{ fontSize: 10, color: '#888' }}>Scale</label>
                  <select
                    className="ap-select"
                    style={{ width: 'auto' }}
                    value={export3DScale}
                    onChange={e => setExport3DScale(Number(e.target.value))}
                  >
                    <option value={1.0}>mm</option>
                    <option value={0.1}>cm</option>
                    <option value={0.001}>m</option>
                    <option value={0.03937}>inches</option>
                  </select>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={export3DIncludeAvatar}
                    onChange={e => setExport3DIncludeAvatar(e.target.checked)}
                  />
                  Include avatar
                </label>
                <button
                  className="ap-btn accent"
                  disabled={!onExport3D}
                  onClick={() => onExport3D?.(export3DFormat, export3DIncludeAvatar, export3DScale)}
                >
                  Export 3D
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
