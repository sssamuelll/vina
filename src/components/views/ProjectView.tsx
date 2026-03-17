import { useState, useRef, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../../store';
import { selectPiece } from '../../store/editorSlice';
import {
  addPiece,
  loadProject,
  addSeam,
  updateAvatar,
  updateMeasurements,
  setProjectName,
  createGroup,
  renameGroup,
  deleteGroup,
  setGroupColor,
  removePiecesFromGroup,
} from '../../store/projectSlice';
import { parseDXF, dxfToPatternPieces, downloadDXFAAMA, downloadMultiSizeDXF } from '../../utils/dxf';
import type { DXFDocument } from '../../utils/dxf/types';
import { downloadPDF } from '../../utils/exportPDF';
import { downloadOBJ } from '../../utils/export/exportOBJ';
import { downloadBOM } from '../../utils/export/bomExport';
import ImportDXFDialog from '../ImportDXFDialog/ImportDXFDialog';
import type { ImportDXFOptions } from '../ImportDXFDialog/ImportDXFDialog';
import ExportSkillModal from '../ExportSkillModal/ExportSkillModal';
import { importZprj } from '../../utils/formats/zprjImport';
import { downloadZprj } from '../../utils/formats/zprjExport';
import { importSVG } from '../../utils/formats/svgImport';
import { importGerber } from '../../utils/formats/gerberImport';
import { downloadGerber } from '../../utils/formats/gerberExport';
import { computeCuttingLayout, DEFAULT_CONFIG } from '../../utils/export/cuttingLayout';
import type { PaperSize, CuttingLayoutConfig } from '../../utils/export/cuttingLayout';
import { exportCuttingPDF } from '../../utils/export/pdfCuttingExport';
import { PAPER_SIZES } from '../../utils/export/cuttingLayout';
import { openMarker } from '../../store/markerSlice';
import type { OpenCloProject, PatternPiece, PieceGroup } from '../../types/types';
import './views.css';

// ─── Collapsible Section ───

interface SectionProps {
  title: string;
  badge?: string | number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function Section({ title, badge, defaultOpen = true, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="sidebar-section">
      <button className="sidebar-section-header" onClick={() => setOpen(!open)}>
        <span className="sidebar-section-toggle">{open ? '\u25BE' : '\u25B8'}</span>
        <span className="sidebar-section-title">{title}</span>
        {badge != null && <span className="sidebar-section-badge">({badge})</span>}
      </button>
      <div className={`sidebar-section-body${open ? '' : ' collapsed'}`}>
        {children}
      </div>
    </div>
  );
}

// ─── Piece Visibility / Lock State (local UI state, not persisted) ───

interface PieceUIState {
  visible: boolean;
  locked: boolean;
}

function getUIFromMap(
  map: Record<string, PieceUIState>,
  id: string,
): PieceUIState {
  return map[id] ?? { visible: true, locked: false };
}

// ─── Main Component ───

export default function ProjectView() {
  const dispatch = useDispatch();
  const pieces = useSelector((s: RootState) => s.project.pieces);
  const seams = useSelector((s: RootState) => s.project.seams);
  const fabrics = useSelector((s: RootState) => s.project.fabrics);
  const avatar = useSelector((s: RootState) => s.project.avatar);
  const projectName = useSelector((s: RootState) => s.project.name);
  const projectId = useSelector((s: RootState) => s.project.id);
  const selectedPieceIds = useSelector((s: RootState) => s.editor.selectedPieceIds);
  const groups = useSelector((s: RootState) => s.project.groups);
  const construction = useSelector((s: RootState) => s.construction);

  // Check if construction has data for skill export
  const hasConstruction = construction?.points?.length > 0;

  // ─── Refs ───

  const dxfInputRef = useRef<HTMLInputElement>(null);
  const zprjInputRef = useRef<HTMLInputElement>(null);
  const svgInputRef = useRef<HTMLInputElement>(null);
  const gerberInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);

  // ─── Local State ───

  const [lastExport, setLastExport] = useState<{ filename: string; date: string } | null>(null);
  const [showExportSkillModal, setShowExportSkillModal] = useState(false);
  const [dxfDialogDoc, setDxfDialogDoc] = useState<DXFDocument | null>(null);

  // Piece visibility/lock (local UI state)
  const [pieceUI, setPieceUI] = useState<Record<string, PieceUIState>>({});

  // Group state
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);

  // Cutting Layout state
  const [clPaperSize, setClPaperSize] = useState<PaperSize>('A0');
  const [clIncludeSA, setClIncludeSA] = useState(true);
  const [clIncludeGrainline, setClIncludeGrainline] = useState(true);
  const [clTileToA4, setClTileToA4] = useState(false);
  const [clScale, setClScale] = useState(1.0);
  const [clUtilization, setClUtilization] = useState<number | null>(null);

  // ─── Piece UI Helpers ───

  const getUI = (id: string): PieceUIState =>
    pieceUI[id] ?? { visible: true, locked: false };

  const toggleVisibility = useCallback((id: string) => {
    setPieceUI(prev => ({
      ...prev,
      [id]: { ...getUIFromMap(prev, id), visible: !getUIFromMap(prev, id).visible },
    }));
  }, []);

  const toggleLock = useCallback((id: string) => {
    setPieceUI(prev => ({
      ...prev,
      [id]: { ...getUIFromMap(prev, id), locked: !getUIFromMap(prev, id).locked },
    }));
  }, []);

  const handleSelectPiece = useCallback((id: string) => {
    dispatch(selectPiece(id));
  }, [dispatch]);

  // ─── Group Handlers ───

  const handleCreateGroup = useCallback(() => {
    const name = `Group ${groups.length + 1}`;
    dispatch(createGroup({ name, pieceIds: selectedPieceIds }));
  }, [dispatch, groups.length, selectedPieceIds]);

  const handleDeleteGroup = useCallback((groupId: string) => {
    dispatch(deleteGroup({ groupId }));
  }, [dispatch]);

  const handleStartRename = useCallback((group: PieceGroup) => {
    setRenamingGroupId(group.id);
    setRenameValue(group.name);
  }, []);

  const handleFinishRename = useCallback((groupId: string) => {
    if (renameValue.trim()) {
      dispatch(renameGroup({ groupId, name: renameValue.trim() }));
    }
    setRenamingGroupId(null);
  }, [dispatch, renameValue]);

  const handleGroupColorChange = useCallback((groupId: string, color: string) => {
    dispatch(setGroupColor({ groupId, color }));
  }, [dispatch]);

  const handleToggleGroupExpand = useCallback((id: string) => {
    setExpandedGroupId(prev => prev === id ? null : id);
  }, []);

  const handleRemoveFromGroup = useCallback((groupId: string, pieceId: string) => {
    dispatch(removePiecesFromGroup({ groupId, pieceIds: [pieceId] }));
  }, [dispatch]);

  const handleAddPiece = useCallback(() => {
    const newPiece: PatternPiece = {
      id: `piece-${Date.now()}`,
      name: `Piece ${pieces.length + 1}`,
      outline: [
        { type: 'M', values: [0, 0] },
        { type: 'L', values: [100, 0] },
        { type: 'L', values: [100, 100] },
        { type: 'L', values: [0, 100] },
        { type: 'Z', values: [] },
      ],
      internals: [],
      position: { x: 50, y: 50 },
      rotation: 0,
      mirrored: false,
      seamAllowance: 10,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    dispatch(addPiece(newPiece));
  }, [dispatch, pieces.length]);

  // ─── Import DXF ───

  const handleImportDXF = useCallback(() => {
    dxfInputRef.current?.click();
  }, []);

  const handleDXFFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const text = await file.text();
      const doc = parseDXF(text);
      setDxfDialogDoc(doc);
      if (dxfInputRef.current) dxfInputRef.current.value = '';
    },
    [],
  );

  const handleDXFDialogImport = useCallback(
    (options: ImportDXFOptions) => {
      if (!dxfDialogDoc) return;
      const dxfPieces = dxfToPatternPieces(dxfDialogDoc, {
        unit: options.unit,
        scale: options.scale,
        importNotches: options.importNotches,
        importGrainlines: options.importGrainlines,
        importInternalLines: options.importInternalLines,
      });
      if (options.loadType === 'open') {
        dispatch(loadProject({
          id: `project-${Date.now()}`,
          name: 'DXF Import',
          pieces: dxfPieces,
          seams: [],
          fabrics: [],
          avatar: {
            id: 'default',
            name: 'Default Avatar',
            modelUrl: '',
            measurements: {
              height: 180,
              chest: 96,
              waist: 82,
              hips: 96,
              shoulder: 44,
              armLength: 64,
              inseam: 82,
            },
          },
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }));
      } else {
        for (const piece of dxfPieces) {
          dispatch(addPiece(piece));
        }
      }
      setDxfDialogDoc(null);
    },
    [dxfDialogDoc, dispatch],
  );

  // ─── Import SVG ───

  const handleImportSVG = useCallback(() => {
    svgInputRef.current?.click();
  }, []);

  const handleSVGFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const text = await file.text();
      const result = importSVG(text);
      for (const piece of result.pieces) {
        dispatch(addPiece(piece));
      }
      if (result.warnings.length > 0) {
        console.warn('SVG import warnings:', result.warnings);
      }
      if (svgInputRef.current) svgInputRef.current.value = '';
    },
    [dispatch],
  );

  // ─── Import .zprj ───

  const handleImportZprj = useCallback(() => {
    zprjInputRef.current?.click();
  }, []);

  const handleZprjFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const result = await importZprj(file);
        for (const piece of result.pieces) dispatch(addPiece(piece));
        for (const seam of result.seams) dispatch(addSeam(seam));
        if (result.projectName) dispatch(setProjectName(result.projectName));
        if (result.avatar?.measurements) dispatch(updateMeasurements(result.avatar.measurements));
        if (result.avatar?.modelUrl) dispatch(updateAvatar({ modelUrl: result.avatar.modelUrl }));
      } catch (err) {
        console.error('Failed to import .zprj:', err);
        alert('Failed to import .zprj file. Check console for details.');
      }
      if (zprjInputRef.current) zprjInputRef.current.value = '';
    },
    [dispatch],
  );

  // ─── Export .zprj ───

  const handleExportZprj = useCallback(() => {
    downloadZprj(
      { pieces, seams, fabrics, avatar, projectName },
      { projectName: projectName || 'project' },
    );
    setLastExport({
      filename: `${projectName || 'project'}.zprj`,
      date: new Date().toLocaleString(),
    });
  }, [pieces, seams, fabrics, avatar, projectName]);

  // ─── Import Gerber ───

  const handleImportGerber = useCallback(() => {
    gerberInputRef.current?.click();
  }, []);

  const handleGerberFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const result = await importGerber(file);
        for (const piece of result.pieces) dispatch(addPiece(piece));
        if (result.warnings.length > 0) {
          console.warn('Gerber import warnings:', result.warnings);
        }
      } catch (err) {
        console.error('Failed to import Gerber:', err);
        alert('Failed to import Gerber AccuMark file. Check console for details.');
      }
      if (gerberInputRef.current) gerberInputRef.current.value = '';
    },
    [dispatch],
  );

  // ─── Export Gerber ───

  const handleExportGerber = useCallback(() => {
    downloadGerber(pieces, seams, projectName || 'accumark-export');
    setLastExport({
      filename: `${projectName || 'accumark-export'}.zip`,
      date: new Date().toLocaleString(),
    });
  }, [pieces, seams, projectName]);

  // ─── Export DXF AAMA / PDF / OBJ ───

  const handleExportDXFAAMA = useCallback(() => {
    const filename = `${projectName || 'pattern'}-aama.dxf`;
    downloadDXFAAMA(pieces, filename);
    setLastExport({ filename, date: new Date().toLocaleString() });
  }, [pieces, projectName]);

  const handleExportMultiSizeDXF = useCallback(() => {
    downloadMultiSizeDXF(
      [{ size: 'BASE', pieces }],
      `${projectName || 'pattern'}-multisize.dxf`,
    );
  }, [pieces, projectName]);

  const handleExportPDF = useCallback(() => {
    const filename = `${projectName || 'pattern'}.pdf`;
    downloadPDF(pieces, filename);
    setLastExport({ filename, date: new Date().toLocaleString() });
  }, [pieces, projectName]);

  const handleExportOBJ = useCallback(() => {
    const filename = `${projectName || 'pattern'}.obj`;
    downloadOBJ(pieces, filename);
    setLastExport({ filename, date: new Date().toLocaleString() });
  }, [pieces, projectName]);

  const handleExportBOM = useCallback(() => {
    downloadBOM(pieces, seams, fabrics, `${projectName || 'project'}-bom.csv`);
    setLastExport({
      filename: `${projectName || 'project'}-bom.csv`,
      date: new Date().toLocaleString(),
    });
  }, [pieces, seams, fabrics, projectName]);

  // ─── Cutting Layout ───

  const handleExportCuttingLayout = useCallback(async () => {
    const config: CuttingLayoutConfig = {
      ...DEFAULT_CONFIG,
      paperSize: clPaperSize,
      scale: clScale,
      includeSeamAllowance: clIncludeSA,
      includeGrainline: clIncludeGrainline,
      tileToA4: clTileToA4,
    };
    const layout = computeCuttingLayout(pieces, seams, config);
    setClUtilization(layout.fabricUtilization);
    const filename = `${projectName || 'pattern'}-cutting-layout.pdf`;
    await exportCuttingPDF(layout, config, filename);
    setLastExport({ filename, date: new Date().toLocaleString() });
  }, [pieces, seams, projectName, clPaperSize, clScale, clIncludeSA, clIncludeGrainline, clTileToA4]);

  const handleEditLayout = useCallback(() => {
    const config: CuttingLayoutConfig = {
      ...DEFAULT_CONFIG,
      paperSize: clPaperSize,
      scale: clScale,
      includeSeamAllowance: clIncludeSA,
      includeGrainline: clIncludeGrainline,
      tileToA4: false,
    };
    const layout = computeCuttingLayout(pieces, seams, config);
    const paperDims = clPaperSize === 'CUSTOM'
      ? { width: 841, height: 1189 }
      : PAPER_SIZES[clPaperSize]!;
    dispatch(openMarker({
      layout,
      paperSize: clPaperSize,
      paperWidth: paperDims.width,
      paperHeight: paperDims.height,
      scale: clScale,
      margin: config.margin,
      includeSeamAllowance: clIncludeSA,
    }));
  }, [dispatch, pieces, seams, clPaperSize, clScale, clIncludeSA, clIncludeGrainline]);

  // ─── Project Save / Load / New ───

  const handleSaveProject = useCallback(() => {
    const project: OpenCloProject = {
      id: projectId,
      name: projectName,
      pieces,
      seams,
      fabrics,
      avatar,
      groups,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const json = JSON.stringify(project, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName || 'project'}.openclo.json`;
    a.click();
    URL.revokeObjectURL(url);
    setLastExport({
      filename: `${projectName || 'project'}.openclo.json`,
      date: new Date().toLocaleString(),
    });
  }, [projectId, projectName, pieces, seams, fabrics, avatar, groups]);

  const handleLoadProject = useCallback(() => {
    projectInputRef.current?.click();
  }, []);

  const handleProjectFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const project = JSON.parse(text) as OpenCloProject;
        dispatch(loadProject(project));
      } catch (err) {
        console.error('Failed to load project:', err);
      }
      if (projectInputRef.current) projectInputRef.current.value = '';
    },
    [dispatch],
  );

  const handleNewProject = useCallback(() => {
    if (window.confirm('Create a new project? Unsaved changes will be lost.')) {
      // Clear persisted project and reset all Redux slices
      import('../../utils/projectIO').then(m => m.clearStorageProject());
      import('../../store/actions').then(m => dispatch(m.NEW_PROJECT()));
    }
  }, [dispatch]);

  // ─── Selected Piece Info ───

  const selectedPiece = pieces.find(p => selectedPieceIds.includes(p.id));
  const grainline = selectedPiece?.internals.find(il => il.type === 'grainline');
  const notch = selectedPiece?.internals.find(il => il.type === 'notch');

  // ─── Render ───

  return (
    <div className="sidebar-view">
      {/* Hidden file inputs */}
      <input
        ref={dxfInputRef}
        type="file"
        accept=".dxf"
        style={{ display: 'none' }}
        onChange={handleDXFFileChange}
      />
      <input
        ref={zprjInputRef}
        type="file"
        accept=".zprj"
        style={{ display: 'none' }}
        onChange={handleZprjFileChange}
      />
      <input
        ref={svgInputRef}
        type="file"
        accept=".svg"
        style={{ display: 'none' }}
        onChange={handleSVGFileChange}
      />
      <input
        ref={gerberInputRef}
        type="file"
        accept=".zip"
        style={{ display: 'none' }}
        onChange={handleGerberFileChange}
      />
      <input
        ref={projectInputRef}
        type="file"
        accept=".json,.openclo.json"
        style={{ display: 'none' }}
        onChange={handleProjectFileChange}
      />

      <div className="sidebar-view-content">
        {/* ─── Project Section ─── */}
        <Section title="Project" defaultOpen={true}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11 }}>
              Name
              <input
                type="text"
                value={projectName}
                onChange={e => dispatch(setProjectName(e.target.value))}
                style={{ width: '100%', marginTop: 2 }}
              />
            </label>
            <button className="sidebar-btn sidebar-btn-primary sidebar-btn-full" onClick={handleSaveProject}>
              Save Project
            </button>
            <button className="sidebar-btn sidebar-btn-full" onClick={handleLoadProject}>
              Open Project
            </button>
            <button className="sidebar-btn sidebar-btn-full" onClick={handleNewProject}>
              New Project
            </button>
          </div>
        </Section>

        {/* ─── Pieces Section ─── */}
        <Section title="Pieces" badge={pieces.length} defaultOpen={true}>
          <div style={{ marginBottom: 4 }}>
            <button
              className="sidebar-btn sidebar-btn-full"
              onClick={handleAddPiece}
              title="Add Piece"
            >
              + Add Piece
            </button>
          </div>
          {pieces.length === 0 ? (
            <div className="sidebar-info">No pieces yet. Add a piece or import a file.</div>
          ) : (
            pieces.map(piece => {
              const ui = getUI(piece.id);
              const isSelected = selectedPieceIds.includes(piece.id);
              return (
                <div key={piece.id}>
                  <div
                    className={`sidebar-list-item${isSelected ? ' selected' : ''}`}
                    onClick={() => handleSelectPiece(piece.id)}
                  >
                    <span className="sidebar-list-item-label">{piece.name}</span>
                    <div className="sidebar-list-item-actions" style={{ opacity: 1 }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleVisibility(piece.id); }}
                        title={ui.visible ? 'Hide' : 'Show'}
                        style={{ opacity: ui.visible ? 1 : 0.4 }}
                      >
                        {'\uD83D\uDC41'}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleLock(piece.id); }}
                        title={ui.locked ? 'Unlock' : 'Lock'}
                        style={{ opacity: ui.locked ? 1 : 0.4 }}
                      >
                        {'\uD83D\uDD12'}
                      </button>
                    </div>
                  </div>
                  {isSelected && (
                    <div className="sidebar-properties">
                      <div className="sidebar-property-row">
                        <span className="sidebar-property-label">Name</span>
                        <span className="sidebar-property-value">{piece.name}</span>
                      </div>
                      <div className="sidebar-property-row">
                        <span className="sidebar-property-label">SA</span>
                        <span className="sidebar-property-value">{piece.seamAllowance}mm</span>
                      </div>
                      <div className="sidebar-property-row">
                        <span className="sidebar-property-label">Notch</span>
                        <span className="sidebar-property-value">
                          {notch?.notchOptions?.shape ?? 'none'}
                        </span>
                      </div>
                      <div className="sidebar-property-row">
                        <span className="sidebar-property-label">Grainline</span>
                        <span className="sidebar-property-value">
                          {grainline ? `${piece.rotation}\u00B0` : '\u2014'}
                        </span>
                      </div>
                      <div className="sidebar-property-row">
                        <span className="sidebar-property-label">Mirror</span>
                        <span className="sidebar-property-value">
                          {piece.mirrored ? '\u2713' : '\u2715'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </Section>

        {/* ─── Groups Section ─── */}
        <Section title="Groups" badge={groups.length} defaultOpen={true}>
          <div style={{ marginBottom: 4 }}>
            <button
              className="sidebar-btn sidebar-btn-full"
              onClick={handleCreateGroup}
              title={selectedPieceIds.length > 0 ? `Create group from ${selectedPieceIds.length} selected` : 'Create empty group'}
            >
              + New Group{selectedPieceIds.length > 0 ? ` (${selectedPieceIds.length} pieces)` : ''}
            </button>
          </div>
          {groups.length === 0 ? (
            <div className="sidebar-info">No groups yet. Select pieces and create a group.</div>
          ) : (
            groups.map(group => (
              <div key={group.id} className="group-row">
                <div
                  className="sidebar-list-item"
                  onClick={() => handleToggleGroupExpand(group.id)}
                >
                  <span className="group-color-dot" style={{ background: group.color }} />
                  {renamingGroupId === group.id ? (
                    <input
                      className="group-rename-input"
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onBlur={() => handleFinishRename(group.id)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleFinishRename(group.id);
                        if (e.key === 'Escape') setRenamingGroupId(null);
                      }}
                      autoFocus
                      onClick={e => e.stopPropagation()}
                    />
                  ) : (
                    <span className="sidebar-list-item-label">{group.name}</span>
                  )}
                  <span className="group-piece-count">{group.pieceIds.length}</span>
                  <div className="sidebar-list-item-actions" style={{ opacity: 1 }}>
                    <input
                      type="color"
                      className="group-color-picker"
                      value={group.color}
                      onChange={e => { e.stopPropagation(); handleGroupColorChange(group.id, e.target.value); }}
                      onClick={e => e.stopPropagation()}
                      title="Group color"
                    />
                    <button
                      onClick={e => { e.stopPropagation(); handleStartRename(group); }}
                      title="Rename"
                    >
                      \u270E
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); handleDeleteGroup(group.id); }}
                      title="Delete group"
                    >
                      \u2715
                    </button>
                  </div>
                </div>
                {expandedGroupId === group.id && (
                  <div className="group-members">
                    {group.pieceIds.length === 0 ? (
                      <div className="sidebar-info" style={{ paddingLeft: 20 }}>No pieces in this group.</div>
                    ) : (
                      group.pieceIds.map(pid => {
                        const piece = pieces.find(p => p.id === pid);
                        if (!piece) return null;
                        return (
                          <div key={pid} className="group-member-row">
                            <span
                              className="group-member-name"
                              onClick={() => handleSelectPiece(pid)}
                            >
                              {piece.name}
                            </span>
                            <button
                              className="group-member-remove"
                              onClick={() => handleRemoveFromGroup(group.id, pid)}
                              title="Remove from group"
                            >
                              \u2715
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </Section>

        {/* ─── Import Section ─── */}
        <Section title="Import" defaultOpen={false}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <button className="sidebar-btn sidebar-btn-full" onClick={handleImportDXF}>
              Import DXF
            </button>
            <button className="sidebar-btn sidebar-btn-full" onClick={handleImportSVG}>
              Import SVG
            </button>
            <button className="sidebar-btn sidebar-btn-full" onClick={handleImportZprj}>
              Import .zprj
            </button>
            <button className="sidebar-btn sidebar-btn-full" onClick={handleImportGerber}>
              Import Gerber AccuMark
            </button>
          </div>
        </Section>

        {/* ─── Export Section ─── */}
        <Section title="Export" defaultOpen={false}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <button
              className="sidebar-btn sidebar-btn-full"
              onClick={handleExportDXFAAMA}
              disabled={pieces.length === 0}
            >
              Export DXF (AAMA)
            </button>
            <button
              className="sidebar-btn sidebar-btn-full"
              onClick={handleExportMultiSizeDXF}
              disabled={pieces.length === 0}
            >
              Export Multi-Size DXF
            </button>
            <button
              className="sidebar-btn sidebar-btn-full"
              onClick={handleExportPDF}
              disabled={pieces.length === 0}
            >
              Export PDF
            </button>
            <button
              className="sidebar-btn sidebar-btn-full"
              onClick={handleExportOBJ}
              disabled={pieces.length === 0}
            >
              Export OBJ
            </button>
            <button
              className="sidebar-btn sidebar-btn-full"
              onClick={handleExportZprj}
              disabled={pieces.length === 0}
            >
              Export .zprj (CLO3D)
            </button>
            <button
              className="sidebar-btn sidebar-btn-full"
              onClick={handleExportGerber}
              disabled={pieces.length === 0}
            >
              Export Gerber AccuMark
            </button>
            <button
              className="sidebar-btn sidebar-btn-full"
              onClick={handleExportBOM}
              disabled={pieces.length === 0}
            >
              Export BOM (CSV)
            </button>
            <hr style={{ border: 'none', borderTop: '1px solid #333', margin: '8px 0' }} />
            <button
              className="sidebar-btn sidebar-btn-full"
              onClick={() => setShowExportSkillModal(true)}
              disabled={!hasConstruction}
              title={hasConstruction ? 'Export as reusable skill' : 'Create a parametric pattern first'}
            >
              Export as Skill
            </button>
          </div>
        </Section>

        {/* ─── Cutting Layout Section ─── */}
        <Section title="Cutting Layout" defaultOpen={false}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11 }}>
              Paper Size
              <select
                value={clPaperSize}
                onChange={e => setClPaperSize(e.target.value as PaperSize)}
                style={{ width: '100%', marginTop: 2 }}
              >
                <option value="A0">A0 (841x1189mm)</option>
                <option value="A1">A1 (594x841mm)</option>
                <option value="A4">A4 (210x297mm)</option>
              </select>
            </label>
            <label style={{ fontSize: 11 }}>
              Scale
              <select
                value={clScale}
                onChange={e => setClScale(Number(e.target.value))}
                style={{ width: '100%', marginTop: 2 }}
              >
                <option value={1}>1:1</option>
                <option value={0.5}>1:2</option>
                <option value={0.2}>1:5</option>
              </select>
            </label>
            <label style={{ fontSize: 11 }}>
              <input type="checkbox" checked={clIncludeSA} onChange={e => setClIncludeSA(e.target.checked)} />
              {' '}Include Seam Allowance
            </label>
            <label style={{ fontSize: 11 }}>
              <input type="checkbox" checked={clIncludeGrainline} onChange={e => setClIncludeGrainline(e.target.checked)} />
              {' '}Include Grainline
            </label>
            <label style={{ fontSize: 11 }}>
              <input
                type="checkbox"
                checked={clTileToA4}
                onChange={e => setClTileToA4(e.target.checked)}
                disabled={clPaperSize === 'A4'}
              />
              {' '}Tile to A4
            </label>
            {clUtilization !== null && (
              <div style={{ fontSize: 11, color: '#888' }}>
                Fabric utilization: {(clUtilization * 100).toFixed(1)}%
              </div>
            )}
            <button
              className="sidebar-btn sidebar-btn-primary sidebar-btn-full"
              onClick={handleExportCuttingLayout}
              disabled={pieces.length === 0}
            >
              Export Cutting Layout
            </button>
            <button
              className="sidebar-btn sidebar-btn-full"
              onClick={handleEditLayout}
              disabled={pieces.length === 0}
            >
              Edit Layout
            </button>
          </div>
        </Section>

        {/* ─── Last Export Section ─── */}
        {lastExport && (
          <Section title="Last Export" defaultOpen={false}>
            <div className="sidebar-info">
              <div>{lastExport.filename}</div>
              <div style={{ color: '#666', marginTop: 2 }}>{lastExport.date}</div>
            </div>
          </Section>
        )}
      </div>

      {/* Import DXF Dialog */}
      {dxfDialogDoc && (
        <ImportDXFDialog
          doc={dxfDialogDoc}
          onImport={handleDXFDialogImport}
          onCancel={() => setDxfDialogDoc(null)}
        />
      )}

      {/* Export Skill Modal */}
      <ExportSkillModal
        isOpen={showExportSkillModal}
        onClose={() => setShowExportSkillModal(false)}
      />
    </div>
  );
}
