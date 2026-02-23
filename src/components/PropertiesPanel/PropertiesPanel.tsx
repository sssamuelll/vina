import { ChevronLeft, ChevronRight, ChevronDown, FileText, Box, Minus, User, Eye, Download, Play, Save, FolderOpen, Plus, X, Printer, FileDown } from 'lucide-react';
import { useState, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store';
import { updatePiece, removePiece, updateMeasurements, setAvatarMode, setAvatarModelUrl, removeSeam, setProjectName, loadProject } from '../../store/projectSlice';
import type { NotchShape, NotchOptions, BodyMeasurements } from '../../types/types';
import { toggleSeamAllowance, setDefaultSAWidth, toggleGrainlines, toggleSnapToGrid, clearSelection, selectSeam, undo, redo } from '../../store/editorSlice';
import { startSimulation, pauseSimulation, resetSimulation } from '../../store/simulationSlice';
import { downloadDXF } from '../../utils/exportDXF';
import { downloadPDF } from '../../utils/exportPDF';
import { downloadProjectFile, uploadProjectFile } from '../../utils/projectIO';
// canUndo/canRedo available if needed
// import { canUndo, canRedo } from '../../store/undoMiddleware';
import './PropertiesPanel.css';

export default function PropertiesPanel() {
  const dispatch = useDispatch();
  const project = useSelector((s: RootState) => s.project);
  const { pieces, seams, fabrics, avatar, avatarMode, avatarModelUrl, name: projectName, isDirty } = project;
  const editor = useSelector((s: RootState) => s.editor);
  const simulation = useSelector((s: RootState) => s.simulation);
  const selectedPiece = pieces.find(p => editor.selectedPieceIds.includes(p.id));
  const [, forceUpdate] = useState(0);
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);
  const [notchSettings, setNotchSettings] = useState<NotchOptions>({
    shape: 'slit', subType: 'straightforward', length: 8, width: 3, angle: 0, count: 1,
  });
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    project: false,
    piece: false,
    avatar: true,
    display: false,
    export: false,
    simulation: false,
  });

  const handleDeletePiece = () => {
    if (selectedPiece) {
      dispatch(removePiece(selectedPiece.id));
      dispatch(clearSelection());
    }
  };

  const handleSave = useCallback(() => {
    downloadProjectFile(project);
  }, [project]);

  const handleLoad = useCallback(async () => {
    try {
      const proj = await uploadProjectFile();
      dispatch(loadProject(proj));
    } catch { /* cancelled */ }
  }, [dispatch]);

  const handleNew = useCallback(() => {
    if (isDirty && !window.confirm('You have unsaved changes. Create new project?')) return;
    dispatch(loadProject({
      id: 'new-project-' + Date.now(),
      name: 'Untitled Project',
      pieces: [],
      seams: [],
      fabrics: [{ id: 'default-cotton', name: 'Cotton', color: '#e8e4df', weight: 150, stretch: 0.05, stiffness: 0.4, friction: 0.5 }],
      avatar: { id: 'default', name: 'Default Avatar', modelUrl: '', measurements: { height: 180, chest: 96, waist: 82, hips: 96, shoulder: 44, armLength: 64, inseam: 82 } },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }));
  }, [dispatch, isDirty]);

  // Undo/redo handled by top toolbar
  void undo; void redo; void forceUpdate;

  const toggleSection = useCallback((sectionId: string) => {
    setCollapsedSections(prev => ({
      ...prev,
      [sectionId]: !prev[sectionId]
    }));
  }, []);

  return (
    <div className={`properties-panel ${isPanelCollapsed ? 'collapsed' : 'expanded'}`}>
      {/* Toggle button */}
      <button 
        className="panel-toggle-btn"
        onClick={() => setIsPanelCollapsed(!isPanelCollapsed)}
        title={isPanelCollapsed ? 'Expand properties panel' : 'Collapse properties panel'}
      >
        {isPanelCollapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>

      {isPanelCollapsed && (
        <div className="panel-icons">
          <button className="panel-icon-shortcut" title="Project" onClick={() => { setIsPanelCollapsed(false); setCollapsedSections(prev => ({ ...prev, project: false })); }}>
            <FileText size={16} />
          </button>
          {selectedPiece && (
            <button className="panel-icon-shortcut" title="Piece" onClick={() => { setIsPanelCollapsed(false); setCollapsedSections(prev => ({ ...prev, piece: false })); }}>
              <Box size={16} />
            </button>
          )}
          {seams.length > 0 && (
            <button className="panel-icon-shortcut" title="Seams" onClick={() => { setIsPanelCollapsed(false); setCollapsedSections(prev => ({ ...prev, seams: false })); }}>
              <Minus size={16} />
            </button>
          )}
          <button className="panel-icon-shortcut" title="Avatar" onClick={() => { setIsPanelCollapsed(false); setCollapsedSections(prev => ({ ...prev, avatar: false })); }}>
            <User size={16} />
          </button>
          <button className="panel-icon-shortcut" title="Display" onClick={() => { setIsPanelCollapsed(false); setCollapsedSections(prev => ({ ...prev, display: false })); }}>
            <Eye size={16} />
          </button>
          {pieces.length > 0 && (
            <button className="panel-icon-shortcut" title="Export" onClick={() => { setIsPanelCollapsed(false); setCollapsedSections(prev => ({ ...prev, export: false })); }}>
              <Download size={16} />
            </button>
          )}
          <button className="panel-icon-shortcut" title="Simulation" onClick={() => { setIsPanelCollapsed(false); setCollapsedSections(prev => ({ ...prev, simulation: false })); }}>
            <Play size={16} />
          </button>
        </div>
      )}

      {!isPanelCollapsed && (
        <div className="panel-content">
          {/* Project Management */}
          <section className="panel-section">
            <button 
              className="panel-section-header"
              onClick={() => toggleSection('project')}
            >
              <span className="panel-title">PROJECT</span>
              <ChevronDown size={12} className={collapsedSections.project ? "collapsed" : "expanded"} />
            </button>
            <div className={`panel-section-body ${collapsedSections.project ? 'collapsed' : ''}`}>
              <div className="panel-section-content">
                <div className="panel-field">
                  <label>Name</label>
                  <input
                    type="text"
                    className="panel-input"
                    value={projectName}
                    onChange={e => dispatch(setProjectName(e.target.value))}
                  />
                </div>
                <div className="panel-button-row">
                  <button className="panel-labeled-btn" onClick={handleSave}>
                    <Save size={14} />
                    <span>Save</span>
                  </button>
                  <button className="panel-labeled-btn" onClick={handleLoad}>
                    <FolderOpen size={14} />
                    <span>Open</span>
                  </button>
                  <button className="panel-labeled-btn" onClick={handleNew}>
                    <Plus size={14} />
                    <span>New</span>
                  </button>
                </div>
              </div>
            </div>
          </section>
          {/* Piece properties */}
          {selectedPiece && (
            <section className="panel-section">
              <button 
                className="panel-section-header"
                onClick={() => toggleSection('piece')}
              >
                <span className="panel-title">PIECE</span>
                <ChevronDown size={12} className={collapsedSections.piece ? "collapsed" : "expanded"} />
              </button>
              <div className={`panel-section-body ${collapsedSections.piece ? 'collapsed' : ''}`}>
                <div className="panel-section-content">
                  <div className="panel-field">
                    <label>Name</label>
                    <input
                      type="text"
                      className="panel-input"
                      value={selectedPiece.name}
                      onChange={e => dispatch(updatePiece({ ...selectedPiece, name: e.target.value, updatedAt: Date.now() }))}
                    />
                  </div>
                  <div className="panel-field">
                    <label>Seam (mm)</label>
                    <input
                      type="number"
                      className="panel-input narrow"
                      value={selectedPiece.seamAllowance}
                      min={0}
                      max={50}
                      onChange={e => dispatch(updatePiece({ ...selectedPiece, seamAllowance: Number(e.target.value), updatedAt: Date.now() }))}
                    />
                  </div>
                  <div className="panel-field" style={{ flexWrap: 'wrap', gap: 4 }}>
                    <label>SA Presets</label>
                    <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                      {([['Overlock', 8], ['Standard', 10], ['Flat-felled', 12], ['French', 15]] as const).map(([label, width]) => (
                        <button
                          key={label}
                          className="panel-labeled-btn"
                          style={{ fontSize: 10, padding: '2px 6px' }}
                          onClick={() => dispatch(updatePiece({ ...selectedPiece, seamAllowance: width, updatedAt: Date.now() }))}
                          title={`${label}: ${width}mm`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="panel-field">
                    <label>Fabric</label>
                    <select
                      className="panel-input"
                      value={selectedPiece.fabricId || ''}
                      onChange={e => dispatch(updatePiece({ ...selectedPiece, fabricId: e.target.value || undefined, updatedAt: Date.now() }))}
                    >
                      <option value="">None</option>
                      {fabrics.map(f => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="panel-field">
                    <label>Mirror</label>
                    <input
                      type="checkbox"
                      checked={selectedPiece.mirrored}
                      onChange={() => dispatch(updatePiece({ ...selectedPiece, mirrored: !selectedPiece.mirrored, updatedAt: Date.now() }))}
                    />
                  </div>
                  <button className="panel-delete" onClick={handleDeletePiece}>
                    Delete Piece
                  </button>

                  {/* Notch Settings */}
                  <div className="notch-settings" style={{ marginTop: 12, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 8 }}>
                    <div style={{ fontSize: 10, color: '#888', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Notch Settings</div>
                    <div className="panel-field">
                      <label>Shape</label>
                      <select
                        className="panel-input"
                        value={notchSettings.shape}
                        onChange={e => setNotchSettings(s => ({ ...s, shape: e.target.value as NotchShape }))}
                      >
                        <option value="slit">Slit</option>
                        <option value="t-notch">T-Notch</option>
                        <option value="v-internal">V-Internal</option>
                        <option value="v-external">V-External</option>
                        <option value="u-notch">U-Notch</option>
                        <option value="castle">Castle</option>
                        <option value="diamond">Diamond</option>
                      </select>
                    </div>
                    <div className="panel-field">
                      <label>Length (mm)</label>
                      <input type="number" className="panel-input narrow" value={notchSettings.length} min={1} max={30}
                        onChange={e => setNotchSettings(s => ({ ...s, length: Number(e.target.value) }))} />
                    </div>
                    <div className="panel-field">
                      <label>Width (mm)</label>
                      <input type="number" className="panel-input narrow" value={notchSettings.width} min={1} max={20}
                        onChange={e => setNotchSettings(s => ({ ...s, width: Number(e.target.value) }))} />
                    </div>
                    <div className="panel-field">
                      <label>Count</label>
                      <select className="panel-input" value={notchSettings.count}
                        onChange={e => setNotchSettings(s => ({ ...s, count: Number(e.target.value) as 1 | 2 | 3 }))}>
                        <option value={1}>1</option>
                        <option value={2}>2</option>
                        <option value={3}>3</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Seams */}
          {seams.length > 0 && (
            <section className="panel-section">
              <button 
                className="panel-section-header"
                onClick={() => toggleSection('seams')}
              >
                <span className="panel-title">SEAMS ({seams.length})</span>
                <ChevronDown size={12} className={collapsedSections.seams ? "collapsed" : "expanded"} />
              </button>
              <div className={`panel-section-body ${collapsedSections.seams ? 'collapsed' : ''}`}>
                <div className="panel-section-content">
                  {seams.map(seam => {
                    const pA = pieces.find(p => p.id === seam.pieceA.pieceId);
                    const pB = pieces.find(p => p.id === seam.pieceB.pieceId);
                    const isSelected = editor.selectedSeamId === seam.id;
                    return (
                      <div
                        key={seam.id}
                        className={`seam-item ${isSelected ? 'selected' : ''}`}
                        onClick={() => dispatch(selectSeam(seam.id))}
                      >
                        <span className="seam-label">
                          {pA?.name || '?'} ↔ {pB?.name || '?'}
                        </span>
                        <span className="seam-type">{seam.type}</span>
                        <button
                          className="seam-delete"
                          onClick={(e) => { e.stopPropagation(); dispatch(removeSeam(seam.id)); }}
                        >
                          <X size={10} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          )}

          {/* Avatar */}
          <section className="panel-section">
            <button 
              className="panel-section-header"
              onClick={() => toggleSection('avatar')}
            >
              <span className="panel-title">AVATAR</span>
              <ChevronDown size={12} className={collapsedSections.avatar ? "collapsed" : "expanded"} />
            </button>
            <div className={`panel-section-body ${collapsedSections.avatar ? 'collapsed' : ''}`}>
              <div className="panel-section-content">
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
                    Load GLB / GLTF avatar
                  </label>
                  <input
                    type="file"
                    accept=".glb,.gltf"
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
              </div>
            </div>
          </section>

          {/* Display */}
          <section className="panel-section">
            <button 
              className="panel-section-header"
              onClick={() => toggleSection('display')}
            >
              <span className="panel-title">DISPLAY</span>
              <ChevronDown size={12} className={collapsedSections.display ? "collapsed" : "expanded"} />
            </button>
            <div className={`panel-section-body ${collapsedSections.display ? 'collapsed' : ''}`}>
              <div className="panel-section-content">
                <label className="panel-toggle">
                  <input type="checkbox" checked={editor.showSeamAllowance} onChange={() => dispatch(toggleSeamAllowance())} />
                  Seam allowance (Shift+S)
                </label>
                {editor.showSeamAllowance && (
                  <div className="panel-field">
                    <label>Default SA (mm)</label>
                    <input
                      type="number"
                      className="panel-input narrow"
                      value={editor.defaultSeamAllowanceWidth}
                      min={0}
                      max={50}
                      onChange={e => dispatch(setDefaultSAWidth(Number(e.target.value)))}
                    />
                  </div>
                )}
                <label className="panel-toggle">
                  <input type="checkbox" checked={editor.showGrainlines} onChange={() => dispatch(toggleGrainlines())} />
                  Grainlines
                </label>
                <label className="panel-toggle">
                  <input type="checkbox" checked={editor.snapToGrid} onChange={() => dispatch(toggleSnapToGrid())} />
                  Snap to grid
                </label>
              </div>
            </div>
          </section>

          {/* Export */}
          {pieces.length > 0 && (
            <section className="panel-section">
              <button 
                className="panel-section-header"
                onClick={() => toggleSection('export')}
              >
                <span className="panel-title">EXPORT</span>
                <ChevronDown size={12} className={collapsedSections.export ? "collapsed" : "expanded"} />
              </button>
              <div className={`panel-section-body ${collapsedSections.export ? 'collapsed' : ''}`}>
                <div className="panel-section-content">
                  <div className="export-buttons">
                    <button
                      className="export-btn"
                      onClick={() => downloadDXF(pieces)}
                      title="Download DXF for cutting plotters"
                    >
                      <Printer size={12} />
                      DXF
                    </button>
                    <button
                      className="export-btn"
                      onClick={() => downloadPDF(pieces)}
                      title="Download PDF at 1:1 scale"
                    >
                      <FileDown size={12} />
                      PDF
                    </button>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Simulation */}
          <section className="panel-section">
            <button 
              className="panel-section-header"
              onClick={() => toggleSection('simulation')}
            >
              <span className="panel-title">SIMULATION</span>
              <ChevronDown size={12} className={collapsedSections.simulation ? "collapsed" : "expanded"} />
            </button>
            <div className={`panel-section-body ${collapsedSections.simulation ? 'collapsed' : ''}`}>
              <div className="panel-section-content">
                <button
                  className={`sim-button ${simulation.simulationState === 'running' ? 'running' : ''}`}
                  onClick={() => {
                    if (simulation.simulationState === 'running') {
                      dispatch(pauseSimulation());
                    } else {
                      dispatch(startSimulation());
                    }
                  }}
                >
                  {simulation.simulationState === 'running' ? 'Pause Simulation' : 'Start Simulation'}
                </button>
                <button
                  className="sim-button"
                  onClick={() => dispatch(resetSimulation())}
                  disabled={simulation.simulationState === 'idle'}
                >
                  Reset Simulation
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
