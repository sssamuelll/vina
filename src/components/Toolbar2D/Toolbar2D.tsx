import { useRef, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store';
import { setActiveTool } from '../../store/editorSlice';
import { addPiece, movePiece, rotatePiece } from '../../store/projectSlice';
import { Tool2D } from '../../types/types';
import { parseDXF, dxfToPatternPieces } from '../../utils/dxf';
import { nestPieces } from '../../utils/nesting';
import type { NestingOptions } from '../../utils/nesting';
import './Toolbar2D.css';

interface ToolDef {
  id: Tool2D;
  label: string;
  shortcut: string;
}

const tools: ToolDef[] = [
  { id: 'select',    label: 'Select',     shortcut: 'V' },
  { id: 'pen',       label: 'Pen',        shortcut: 'P' },
  { id: 'line',      label: 'Line',       shortcut: 'L' },
  { id: 'rectangle', label: 'Rectangle',  shortcut: 'R' },
  { id: 'seam',      label: 'Seam',       shortcut: 'S' },
  { id: 'notch',     label: 'Notch',      shortcut: 'N' },
  { id: 'grainline', label: 'Grainline',  shortcut: 'G' },
  { id: 'measure',   label: 'Measure',    shortcut: 'M' },
  { id: 'hand',      label: 'Hand',       shortcut: 'H' },
];

const getToolIcon = (toolId: Tool2D) => {
  const iconProps = {
    width: 18,
    height: 18,
    viewBox: "0 0 18 18",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const
  };

  switch (toolId) {
    case 'select':
      return (
        <svg {...iconProps}>
          <path d="M3 3L15 9L9 15L3 3Z" fill="currentColor" fillOpacity="0.2"/>
          <path d="M3 3L15 9L9 15L3 3Z"/>
        </svg>
      );
    case 'pen':
      return (
        <svg {...iconProps}>
          <path d="M12 2L16 6L6 16L2 16L2 12L12 2Z"/>
          <path d="M11 3L15 7"/>
        </svg>
      );
    case 'line':
      return (
        <svg {...iconProps}>
          <path d="M4 14L14 4"/>
        </svg>
      );
    case 'rectangle':
      return (
        <svg {...iconProps}>
          <rect x="3" y="5" width="12" height="8"/>
        </svg>
      );
    case 'seam':
      return (
        <svg {...iconProps}>
          <path d="M6 3V15M12 3V15"/>
          <path d="M6 6L12 6M6 9L12 9M6 12L12 12" strokeWidth="1"/>
        </svg>
      );
    case 'notch':
      return (
        <svg {...iconProps}>
          <path d="M9 3V15M6 6L9 3L12 6"/>
        </svg>
      );
    case 'grainline':
      return (
        <svg {...iconProps}>
          <path d="M9 2V16"/>
          <path d="M6 5L9 2L12 5"/>
          <path d="M6 13L9 16L12 13"/>
        </svg>
      );
    case 'measure':
      return (
        <svg {...iconProps}>
          <path d="M3 8H15"/>
          <path d="M3 6V10M6 7V9M9 6V10M12 7V9M15 6V10"/>
        </svg>
      );
    case 'hand':
      return (
        <svg {...iconProps}>
          <path d="M8 2V8M5 4V10L3 12C2.5 12.5 2.5 13.5 3 14L4 15C4.5 15.5 5.5 15.5 6 15H12C13.5 15 15 13.5 15 12V8C15 7 14 6 13 6S11 7 11 8M11 6V4C11 3 10 2 9 2S8 3 8 4"/>
        </svg>
      );
    default:
      return null;
  }
};

const ROTATION_OPTIONS = [0, 15, 30, 45, 90, 180];

export default function Toolbar2D() {
  const dispatch = useDispatch();
  const { activeTool } = useSelector((s: RootState) => s.editor);
  const pieces = useSelector((s: RootState) => s.project.pieces);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showNesting, setShowNesting] = useState(false);
  const [nestingResult, setNestingResult] = useState<string | null>(null);
  const [sheetWidth, setSheetWidth] = useState(1500);
  const [sheetHeight, setSheetHeight] = useState(3000);
  const [nestGap, setNestGap] = useState(5);
  const [rotStep, setRotStep] = useState(90);

  const handleImportDXF = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const doc = parseDXF(text);
    const dxfPieces = dxfToPatternPieces(doc);
    for (const piece of dxfPieces) {
      dispatch(addPiece(piece));
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRunNesting = () => {
    if (pieces.length === 0) {
      setNestingResult('No pieces to layout');
      return;
    }

    const options: NestingOptions = {
      sheet: { width: sheetWidth, height: sheetHeight, margin: 10 },
      gap: nestGap,
      rotationStep: rotStep,
      allowMirror: false,
      sortStrategy: 'area-desc',
    };

    const result = nestPieces(pieces, options);

    // Apply placements
    for (const p of result.placements) {
      dispatch(movePiece({ id: p.pieceId, x: p.x, y: p.y }));
      dispatch(rotatePiece({ id: p.pieceId, rotation: p.rotation }));
    }

    const pct = (result.utilization * 100).toFixed(1);
    setNestingResult(
      `${result.sheetsUsed} sheet${result.sheetsUsed !== 1 ? 's' : ''}, ${pct}% utilization` +
      (result.unplaced.length > 0 ? ` (${result.unplaced.length} unplaced)` : '')
    );
  };

  return (
    <div className="toolbar2d">
      {tools.map(tool => (
        <button
          key={tool.id}
          className={`tool-btn ${activeTool === tool.id ? 'active' : ''}`}
          onClick={() => dispatch(setActiveTool(tool.id))}
          title={`${tool.label} (${tool.shortcut})`}
        >
          <span className="tool-icon">{getToolIcon(tool.id)}</span>
        </button>
      ))}
      <div className="tool-separator" />
      <button
        className="tool-btn"
        onClick={handleImportDXF}
        title="Import DXF"
      >
        <span className="tool-icon">
          <svg width={18} height={18} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 15V3h8l4 4v8H3z" />
            <path d="M9 8v5M7 11l2 2 2-2" />
          </svg>
        </span>
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".dxf"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
      <div className="tool-separator" />
      <button
        className="tool-btn"
        onClick={() => setShowNesting(!showNesting)}
        title="Auto Layout (Nesting)"
      >
        <span className="tool-icon">
          <svg width={18} height={18} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="2" width="6" height="8" />
            <rect x="10" y="2" width="6" height="5" />
            <rect x="10" y="9" width="6" height="7" />
            <rect x="2" y="12" width="6" height="4" />
          </svg>
        </span>
      </button>
      {showNesting && (
        <div className="nesting-popover">
          <div className="nesting-title">Auto Layout</div>
          <label>
            Sheet W (mm)
            <input type="number" value={sheetWidth} onChange={e => setSheetWidth(+e.target.value)} />
          </label>
          <label>
            Sheet H (mm)
            <input type="number" value={sheetHeight} onChange={e => setSheetHeight(+e.target.value)} />
          </label>
          <label>
            Gap (mm)
            <input type="number" value={nestGap} onChange={e => setNestGap(+e.target.value)} />
          </label>
          <label>
            Rotation
            <select value={rotStep} onChange={e => setRotStep(+e.target.value)}>
              {ROTATION_OPTIONS.map(r => (
                <option key={r} value={r}>{r === 0 ? 'None' : `${r}°`}</option>
              ))}
            </select>
          </label>
          <button className="nesting-run-btn" onClick={handleRunNesting}>
            Run
          </button>
          {nestingResult && <div className="nesting-result">{nestingResult}</div>}
        </div>
      )}
    </div>
  );
}
