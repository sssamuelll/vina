import { ChevronLeft, ChevronRight, FileText, Box, Minus, User, Eye, Download, Play, Save, FolderOpen, Plus, X, Printer, FileDown } from 'lucide-react';
import { useState, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store';
import { removePiece, removeSeam, setProjectName, loadProject } from '../../store/projectSlice';
import { toggleSeamAllowance, setDefaultSAWidth, toggleGrainlines, toggleSnapToGrid, clearSelection, selectSeam, undo, redo } from '../../store/editorSlice';
import { downloadDXF } from '../../utils/exportDXF';
import { downloadPDF } from '../../utils/exportPDF';
import { downloadProjectFile, uploadProjectFile } from '../../utils/projectIO';
import PropertySection from './PropertySection';
import PieceProperties from './PieceProperties';
import AvatarProperties from './AvatarProperties';
import SimulationProperties from './SimulationProperties';
import './PropertiesPanel.css';

export default function PropertiesPanel() {
  const dispatch = useDispatch();
  const project = useSelector((s: RootState) => s.project);
  const { pieces, seams, avatar: _avatar, avatarModelUrl: _avatarModelUrl, name: projectName, isDirty } = project;
  const editor = useSelector((s: RootState) => s.editor);
  const selectedPiece = pieces.find(p => editor.selectedPieceIds.includes(p.id));
  const [, forceUpdate] = useState(0);
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    project: false,
    piece: false,
    avatar: true,
    display: false,
    export: false,
    simulation: false,
  });

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
    import('../../utils/projectIO').then(m => m.clearStorageProject());
    import('../../store/actions').then(m => dispatch(m.NEW_PROJECT()));
  }, [dispatch, isDirty]);

  // Undo/redo handled by top toolbar
  void undo; void redo; void forceUpdate;
  // Suppress unused warnings for destructured but forwarded values
  void _avatar; void _avatarModelUrl; void removePiece; void clearSelection;

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
          <PropertySection id="project" title="PROJECT" collapsed={!!collapsedSections.project} onToggle={toggleSection}>
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
          </PropertySection>

          {/* Piece properties */}
          {selectedPiece && (
            <PieceProperties piece={selectedPiece} collapsed={!!collapsedSections.piece} onToggle={toggleSection} />
          )}

          {/* Seams */}
          {seams.length > 0 && (
            <PropertySection id="seams" title={`SEAMS (${seams.length})`} collapsed={!!collapsedSections.seams} onToggle={toggleSection}>
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
            </PropertySection>
          )}

          {/* Avatar */}
          <AvatarProperties collapsed={!!collapsedSections.avatar} onToggle={toggleSection} />

          {/* Display */}
          <PropertySection id="display" title="DISPLAY" collapsed={!!collapsedSections.display} onToggle={toggleSection}>
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
          </PropertySection>

          {/* Export */}
          {pieces.length > 0 && (
            <PropertySection id="export" title="EXPORT" collapsed={!!collapsedSections.export} onToggle={toggleSection}>
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
            </PropertySection>
          )}

          {/* Simulation */}
          <SimulationProperties collapsed={!!collapsedSections.simulation} onToggle={toggleSection} />
        </div>
      )}
    </div>
  );
}
