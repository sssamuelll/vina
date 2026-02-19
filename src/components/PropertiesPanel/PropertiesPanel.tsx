import { useState, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store';
import { updatePiece, removePiece, updateMeasurements, setAvatarMode, setAvatarModelUrl, removeSeam, setProjectName, loadProject } from '../../store/projectSlice';
import { toggleSimulation, toggleSeamAllowance, toggleGrainlines, toggleSnapToGrid, clearSelection, selectSeam, undo, redo } from '../../store/editorSlice';
import { downloadDXF } from '../../utils/exportDXF';
import { downloadPDF } from '../../utils/exportPDF';
import { downloadProjectFile, uploadProjectFile } from '../../utils/projectIO';
import { canUndo, canRedo } from '../../store/undoMiddleware';
import './PropertiesPanel.css';

export default function PropertiesPanel() {
  const dispatch = useDispatch();
  const project = useSelector((s: RootState) => s.project);
  const { pieces, seams, fabrics, avatar, avatarMode, avatarModelUrl, name: projectName, isDirty } = project;
  const editor = useSelector((s: RootState) => s.editor);
  const selectedPiece = pieces.find(p => editor.selectedPieceIds.includes(p.id));
  const [, forceUpdate] = useState(0);
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    project: false,
    piece: false,
    avatar: false,
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
      avatar: { id: 'default', name: 'Default Avatar', modelUrl: '', measurements: { height: 170, chest: 90, waist: 70, hips: 95, shoulder: 40, armLength: 60, inseam: 80 } },
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
  }, [dispatch, isDirty]);

  const handleUndo = useCallback(() => { dispatch(undo()); forceUpdate(n => n + 1); }, [dispatch]);
  const handleRedo = useCallback(() => { dispatch(redo()); forceUpdate(n => n + 1); }, [dispatch]);

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
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path 
            d={isPanelCollapsed ? "M4 3L7 6L4 9" : "M8 3L5 6L8 9"} 
            stroke="currentColor" 
            strokeWidth="1.5" 
            strokeLinecap="round" 
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {!isPanelCollapsed && (
        <div className="panel-content">
          {/* Project Management */}
          <section className="panel-section">
            <button 
              className="panel-section-header"
              onClick={() => toggleSection('project')}
            >
              <span className="panel-title">PROJECT</span>
              <svg 
                width="12" 
                height="12" 
                viewBox="0 0 12 12" 
                fill="none"
                className={collapsedSections.project ? 'collapsed' : 'expanded'}
              >
                <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            {!collapsedSections.project && (
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
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M10 1H3C2.45 1 2 1.45 2 2V12C2 12.55 2.45 13 3 13H11C11.55 13 12 12.55 12 12V4L10 1Z" stroke="currentColor" strokeWidth="1" fill="none"/>
                      <path d="M8.5 1V5H4.5V1M8.5 9V13H4.5V9H8.5Z" stroke="currentColor" strokeWidth="1" fill="none"/>
                    </svg>
                    <span>Save</span>
                  </button>
                  <button className="panel-labeled-btn" onClick={handleLoad}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M2 11V3C2 2.45 2.45 2 3 2H6L8 4H11C11.55 4 12 4.45 12 5V11C12 11.55 11.55 12 11 12H3C2.45 12 2 11.55 2 11Z" stroke="currentColor" strokeWidth="1" fill="none"/>
                    </svg>
                    <span>Open</span>
                  </button>
                  <button className="panel-labeled-btn" onClick={handleNew}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M7 3V11M3 7H11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                    <span>New</span>
                  </button>
                </div>
              </div>
            )}
          </section>
          {/* Piece properties */}
          {selectedPiece && (
            <section className="panel-section">
              <button 
                className="panel-section-header"
                onClick={() => toggleSection('piece')}
              >
                <span className="panel-title">PIECE</span>
                <svg 
                  width="12" 
                  height="12" 
                  viewBox="0 0 12 12" 
                  fill="none"
                  className={collapsedSections.piece ? 'collapsed' : 'expanded'}
                >
                  <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              {!collapsedSections.piece && (
                <div className="panel-section-content">
                  <div className="panel-field">
                    <label>Name</label>
                    <input
                      type="text"
                      className="panel-input"
                      value={selectedPiece.name}
                      onChange={e => dispatch(updatePiece({ ...selectedPiece, name: e.target.value, updatedAt: new Date() }))}
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
                      onChange={e => dispatch(updatePiece({ ...selectedPiece, seamAllowance: Number(e.target.value), updatedAt: new Date() }))}
                    />
                  </div>
                  <div className="panel-field">
                    <label>Fabric</label>
                    <select
                      className="panel-input"
                      value={selectedPiece.fabricId || ''}
                      onChange={e => dispatch(updatePiece({ ...selectedPiece, fabricId: e.target.value || undefined, updatedAt: new Date() }))}
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
                      onChange={() => dispatch(updatePiece({ ...selectedPiece, mirrored: !selectedPiece.mirrored, updatedAt: new Date() }))}
                    />
                  </div>
                  <button className="panel-delete" onClick={handleDeletePiece}>
                    Delete Piece
                  </button>
                </div>
              )}
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
                <svg 
                  width="12" 
                  height="12" 
                  viewBox="0 0 12 12" 
                  fill="none"
                  className={collapsedSections.seams ? 'collapsed' : 'expanded'}
                >
                  <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              {!collapsedSections.seams && (
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
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                            <path d="M2 2L8 8M8 2L2 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                          </svg>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* Avatar */}
          <section className="panel-section">
            <button 
              className="panel-section-header"
              onClick={() => toggleSection('avatar')}
            >
              <span className="panel-title">AVATAR</span>
              <svg 
                width="12" 
                height="12" 
                viewBox="0 0 12 12" 
                fill="none"
                className={collapsedSections.avatar ? 'collapsed' : 'expanded'}
              >
                <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            {!collapsedSections.avatar && (
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
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Display */}
          <section className="panel-section">
            <button 
              className="panel-section-header"
              onClick={() => toggleSection('display')}
            >
              <span className="panel-title">DISPLAY</span>
              <svg 
                width="12" 
                height="12" 
                viewBox="0 0 12 12" 
                fill="none"
                className={collapsedSections.display ? 'collapsed' : 'expanded'}
              >
                <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            {!collapsedSections.display && (
              <div className="panel-section-content">
                <label className="panel-toggle">
                  <input type="checkbox" checked={editor.showSeamAllowance} onChange={() => dispatch(toggleSeamAllowance())} />
                  Seam allowance
                </label>
                <label className="panel-toggle">
                  <input type="checkbox" checked={editor.showGrainlines} onChange={() => dispatch(toggleGrainlines())} />
                  Grainlines
                </label>
                <label className="panel-toggle">
                  <input type="checkbox" checked={editor.snapToGrid} onChange={() => dispatch(toggleSnapToGrid())} />
                  Snap to grid
                </label>
              </div>
            )}
          </section>

          {/* Export */}
          {pieces.length > 0 && (
            <section className="panel-section">
              <button 
                className="panel-section-header"
                onClick={() => toggleSection('export')}
              >
                <span className="panel-title">EXPORT</span>
                <svg 
                  width="12" 
                  height="12" 
                  viewBox="0 0 12 12" 
                  fill="none"
                  className={collapsedSections.export ? 'collapsed' : 'expanded'}
                >
                  <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              {!collapsedSections.export && (
                <div className="panel-section-content">
                  <div className="export-buttons">
                    <button
                      className="export-btn"
                      onClick={() => downloadDXF(pieces)}
                      title="Download DXF for cutting plotters"
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M3 1H9V3H3V1ZM1 5H11V11H1V5Z" stroke="currentColor" strokeWidth="1" fill="none"/>
                        <path d="M3 7H9M5 9H7" stroke="currentColor" strokeWidth="1"/>
                      </svg>
                      DXF
                    </button>
                    <button
                      className="export-btn"
                      onClick={() => downloadPDF(pieces)}
                      title="Download PDF at 1:1 scale"
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M8 1H3C2.45 1 2 1.45 2 2V10C2 10.55 2.45 11 3 11H9C9.55 11 10 10.55 10 10V4L8 1Z" stroke="currentColor" strokeWidth="1" fill="none"/>
                        <path d="M8 1V4H10" stroke="currentColor" strokeWidth="1" fill="none"/>
                      </svg>
                      PDF
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Simulation */}
          <section className="panel-section">
            <button 
              className="panel-section-header"
              onClick={() => toggleSection('simulation')}
            >
              <span className="panel-title">SIMULATION</span>
              <svg 
                width="12" 
                height="12" 
                viewBox="0 0 12 12" 
                fill="none"
                className={collapsedSections.simulation ? 'collapsed' : 'expanded'}
              >
                <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            {!collapsedSections.simulation && (
              <div className="panel-section-content">
                <button
                  className={`sim-button ${editor.simulationRunning ? 'running' : ''}`}
                  onClick={() => dispatch(toggleSimulation())}
                >
                  {editor.simulationRunning ? 'Pause Simulation' : 'Start Simulation'}
                </button>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
