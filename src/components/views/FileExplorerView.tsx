import { useState, useRef, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../../store';
import { addPiece, loadProject, setProjectName } from '../../store/projectSlice';
import { parseDXF, dxfToPatternPieces, downloadDXFAAMA } from '../../utils/dxf';
import { downloadPDF } from '../../utils/exportPDF';
import { downloadOBJ } from '../../utils/export/exportOBJ';
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
  const projectInputRef = useRef<HTMLInputElement>(null);

  const [lastExport, setLastExport] = useState<{ filename: string; date: string } | null>(null);

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

  // ─── Project Save / Load ───

  const handleSaveProject = useCallback(() => {
    const project: OpenCloProject = {
      id: projectId,
      name: projectName,
      pieces,
      seams,
      fabrics,
      avatar,
      createdAt: new Date(),
      updatedAt: new Date(),
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
    // Reload to reset state (simple approach)
    if (window.confirm('Create a new project? Unsaved changes will be lost.')) {
      window.location.reload();
    }
  }, []);

  return (
    <div className="sidebar-view">
      <div className="sidebar-view-header">
        <h2>Files</h2>
      </div>

      {/* Hidden file inputs */}
      <input
        ref={dxfInputRef}
        type="file"
        accept=".dxf"
        style={{ display: 'none' }}
        onChange={handleDXFFileChange}
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
            <button className="sidebar-btn sidebar-btn-full" disabled title="Coming soon">
              📄 Import SVG
            </button>
            <button className="sidebar-btn sidebar-btn-full" disabled title="Coming soon">
              📁 Import .zprj
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
