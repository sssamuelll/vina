import { useState, useRef, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../../store';
import { addPiece, loadProject, addSeam, updateAvatar, updateMeasurements, setProjectName } from '../../store/projectSlice';
import { parseDXF, dxfToPatternPieces, downloadDXFAAMA } from '../../utils/dxf';
import { downloadPDF } from '../../utils/exportPDF';
import { downloadOBJ } from '../../utils/export/exportOBJ';
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
import type { OpenCloProject } from '../../types/types';
import './views.css';

// ─── Collapsible Section ───

interface SectionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function Section({ title, defaultOpen = true, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="sidebar-section">
      <button className="sidebar-section-header" onClick={() => setOpen(!open)}>
        <span className="sidebar-section-toggle">{open ? '▾' : '▸'}</span>
        <span className="sidebar-section-title">{title}</span>
      </button>
      <div className={`sidebar-section-body${open ? '' : ' collapsed'}`}>
        {children}
      </div>
    </div>
  );
}

// ─── Main Component ───

export default function FileExplorerView() {
  const dispatch = useDispatch();
  const pieces = useSelector((s: RootState) => s.project.pieces);
  const seams = useSelector((s: RootState) => s.project.seams);
  const fabrics = useSelector((s: RootState) => s.project.fabrics);
  const avatar = useSelector((s: RootState) => s.project.avatar);
  const projectName = useSelector((s: RootState) => s.project.name);
  const projectId = useSelector((s: RootState) => s.project.id);

  const dxfInputRef = useRef<HTMLInputElement>(null);
  const zprjInputRef = useRef<HTMLInputElement>(null);
  const svgInputRef = useRef<HTMLInputElement>(null);
  const gerberInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);

  const [lastExport, setLastExport] = useState<{ filename: string; date: string } | null>(null);

  // ─── Cutting Layout State ───
  const [clPaperSize, setClPaperSize] = useState<PaperSize>('A0');
  const [clIncludeSA, setClIncludeSA] = useState(true);
  const [clIncludeGrainline, setClIncludeGrainline] = useState(true);
  const [clTileToA4, setClTileToA4] = useState(false);
  const [clScale, setClScale] = useState(1.0);
  const [clUtilization, setClUtilization] = useState<number | null>(null);

  // ─── Import ───

  const handleImportDXF = useCallback(() => {
    dxfInputRef.current?.click();
  }, []);

  const handleDXFFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const text = await file.text();
      const doc = parseDXF(text);
      const dxfPieces = dxfToPatternPieces(doc);
      for (const piece of dxfPieces) {
        dispatch(addPiece(piece));
      }
      if (dxfInputRef.current) dxfInputRef.current.value = '';
    },
    [dispatch],
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

  // ─── Export ───

  const handleExportDXFAAMA = useCallback(() => {
    const filename = `${projectName || 'pattern'}-aama.dxf`;
    downloadDXFAAMA(pieces, filename);
    setLastExport({ filename, date: new Date().toLocaleString() });
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

  // ─── Project Save / Load ───

  const handleSaveProject = useCallback(() => {
    const project: OpenCloProject = {
      id: projectId,
      name: projectName,
      pieces,
      seams,
      fabrics,
      avatar,
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
  }, [projectId, projectName, pieces, seams, fabrics, avatar]);

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
      import('../../utils/projectIO').then(m => m.clearLocalStorageProject());
      import('../../store/actions').then(m => dispatch(m.NEW_PROJECT()));
    }
  }, [dispatch]);

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
        {/* Import Section */}
        <Section title="Import">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <button className="sidebar-btn sidebar-btn-full" onClick={handleImportDXF}>
              📄 Import DXF
            </button>
            <button className="sidebar-btn sidebar-btn-full" onClick={handleImportSVG}>
              📄 Import SVG
            </button>
            <button className="sidebar-btn sidebar-btn-full" onClick={handleImportZprj}>
              📁 Import .zprj
            </button>
            <button className="sidebar-btn sidebar-btn-full" onClick={handleImportGerber}>
              📦 Import Gerber AccuMark
            </button>
          </div>
        </Section>

        {/* Export Section */}
        <Section title="Export">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <button
              className="sidebar-btn sidebar-btn-full"
              onClick={handleExportDXFAAMA}
              disabled={pieces.length === 0}
            >
              📐 Export DXF (AAMA)
            </button>
            <button
              className="sidebar-btn sidebar-btn-full"
              onClick={handleExportPDF}
              disabled={pieces.length === 0}
            >
              📄 Export PDF
            </button>
            <button
              className="sidebar-btn sidebar-btn-full"
              onClick={handleExportOBJ}
              disabled={pieces.length === 0}
            >
              🧊 Export OBJ
            </button>
            <button
              className="sidebar-btn sidebar-btn-full"
              onClick={handleExportZprj}
              disabled={pieces.length === 0}
            >
              📁 Export .zprj (CLO3D)
            </button>
            <button
              className="sidebar-btn sidebar-btn-full"
              onClick={handleExportGerber}
              disabled={pieces.length === 0}
            >
              📦 Export Gerber AccuMark
            </button>
          </div>
        </Section>

        {/* Cutting Layout Section */}
        <Section title="Cutting Layout">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11 }}>
              Paper Size
              <select
                value={clPaperSize}
                onChange={e => setClPaperSize(e.target.value as PaperSize)}
                style={{ width: '100%', marginTop: 2 }}
              >
                <option value="A0">A0 (841×1189mm)</option>
                <option value="A1">A1 (594×841mm)</option>
                <option value="A4">A4 (210×297mm)</option>
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
              ✂️ Export Cutting Layout
            </button>
            <button
              className="sidebar-btn sidebar-btn-full"
              onClick={handleEditLayout}
              disabled={pieces.length === 0}
            >
              ✏️ Edit Layout
            </button>
          </div>
        </Section>

        {/* Project Section */}
        <Section title="Project">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <button className="sidebar-btn sidebar-btn-primary sidebar-btn-full" onClick={handleSaveProject}>
              💾 Save Project
            </button>
            <button className="sidebar-btn sidebar-btn-full" onClick={handleLoadProject}>
              📂 Load Project
            </button>
            <button className="sidebar-btn sidebar-btn-full" onClick={handleNewProject}>
              ✨ New Project
            </button>
          </div>
        </Section>

        {/* Last Export Info */}
        {lastExport && (
          <Section title="Last Export" defaultOpen={false}>
            <div className="sidebar-info">
              <div>{lastExport.filename}</div>
              <div style={{ color: '#666', marginTop: 2 }}>{lastExport.date}</div>
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}
