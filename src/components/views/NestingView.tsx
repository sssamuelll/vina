import { useState, useCallback, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../../store';
import { movePiece, rotatePiece } from '../../store/projectSlice';
import { setZoom2D, setPan2D } from '../../store/editorSlice';
import { nestPieces } from '../../utils/nesting';
import type { NestingOptions, NestingResult, PlacedPiece } from '../../utils/nesting';
import './views.css';

// ─── Constants ───

const ROTATION_OPTIONS: { label: string; value: number }[] = [
  { label: 'None', value: 0 },
  { label: '15°', value: 15 },
  { label: '30°', value: 30 },
  { label: '45°', value: 45 },
  { label: '90°', value: 90 },
];

const SORT_STRATEGIES: { label: string; value: NestingOptions['sortStrategy'] }[] = [
  { label: 'Area ↓', value: 'area-desc' },
  { label: 'Height ↓', value: 'height-desc' },
  { label: 'Width ↓', value: 'width-desc' },
];

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

export default function NestingView() {
  const dispatch = useDispatch();
  const pieces = useSelector((s: RootState) => s.project.pieces);

  // Fabric dimensions
  const [sheetWidth, setSheetWidth] = useState(1500);
  const [sheetHeight, setSheetHeight] = useState(3000);
  const [margin, setMargin] = useState(10);

  // Settings
  const [gap, setGap] = useState(5);
  const [rotationStep, setRotationStep] = useState(90);
  const [allowMirror, setAllowMirror] = useState(false);
  const [sortStrategy, setSortStrategy] = useState<NestingOptions['sortStrategy']>('area-desc');

  // Results
  const [result, setResult] = useState<NestingResult | null>(null);
  const [placements, setPlacements] = useState<PlacedPiece[]>([]);

  const handleRunNesting = useCallback(() => {
    if (pieces.length === 0) return;

    const options: NestingOptions = {
      sheet: { width: sheetWidth, height: sheetHeight, margin },
      gap,
      rotationStep,
      allowMirror,
      sortStrategy,
    };

    const nestResult = nestPieces(pieces, options);
    setResult(nestResult);
    setPlacements(nestResult.placements);

    // Apply placements to the store
    for (const p of nestResult.placements) {
      dispatch(movePiece({ id: p.pieceId, x: p.x, y: p.y }));
      dispatch(rotatePiece({ id: p.pieceId, rotation: p.rotation }));
    }

    // Zoom to fit all placed pieces
    if (nestResult.placements.length > 0) {
      // Calculate bounding box of all placements
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of nestResult.placements) {
        const piece = pieces.find(pc => pc.id === p.pieceId);
        if (!piece) continue;
        for (const cmd of piece.outline) {
          for (let i = 0; i < cmd.values.length - 1; i += 2) {
            const px = p.x + cmd.values[i];
            const py = p.y + cmd.values[i + 1];
            minX = Math.min(minX, px);
            minY = Math.min(minY, py);
            maxX = Math.max(maxX, px);
            maxY = Math.max(maxY, py);
          }
        }
      }
      const contentW = maxX - minX;
      const contentH = maxY - minY;
      // Assume viewport ~800x600, leave 10% padding
      const viewW = 800;
      const viewH = 600;
      const zoom = Math.min(viewW / (contentW * 1.2), viewH / (contentH * 1.2), 2);
      const panX = viewW / 2 - (minX + contentW / 2) * zoom;
      const panY = viewH / 2 - (minY + contentH / 2) * zoom;
      dispatch(setZoom2D(Math.max(0.05, zoom)));
      dispatch(setPan2D({ x: panX, y: panY }));
    }
  }, [dispatch, pieces, sheetWidth, sheetHeight, margin, gap, rotationStep, allowMirror, sortStrategy]);

  // Build a simple SVG preview of placed pieces (as rectangles)
  const previewSvg = useMemo(() => {
    if (!result || placements.length === 0) return null;

    // We'll show the first sheet scaled to fit the preview area
    const sheetW = sheetWidth;
    const sheetH = sheetHeight;

    // Filter placements for sheet 0
    const sheet0 = placements.filter(p => p.sheetIndex === 0);

    // Map piece IDs to names
    const pieceMap = new Map(pieces.map(p => [p.id, p]));

    return (
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${sheetW} ${sheetH}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ background: '#1a1a1a' }}
      >
        {/* Sheet outline */}
        <rect
          x={0}
          y={0}
          width={sheetW}
          height={sheetH}
          fill="none"
          stroke="#555"
          strokeWidth={4}
        />
        {/* Margin area */}
        <rect
          x={margin}
          y={margin}
          width={sheetW - 2 * margin}
          height={sheetH - 2 * margin}
          fill="none"
          stroke="#333"
          strokeWidth={2}
          strokeDasharray="8 4"
        />
        {/* Placed pieces */}
        {sheet0.map((pl, i) => {
          const piece = pieceMap.get(pl.pieceId);
          if (!piece) return null;

          // Approximate bounding box (simplified)
          const bboxW = 80;
          const bboxH = 60;

          return (
            <g key={pl.pieceId}>
              <rect
                x={pl.x}
                y={pl.y}
                width={bboxW}
                height={bboxH}
                fill={`hsl(${(i * 60) % 360}, 50%, 35%)`}
                stroke={`hsl(${(i * 60) % 360}, 60%, 55%)`}
                strokeWidth={2}
                opacity={0.8}
              />
              <text
                x={pl.x + bboxW / 2}
                y={pl.y + bboxH / 2}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#cccccc"
                fontSize={Math.min(bboxW, bboxH) * 0.2}
              >
                {piece.name}
              </text>
            </g>
          );
        })}
      </svg>
    );
  }, [result, placements, pieces, sheetWidth, sheetHeight, margin]);

  return (
    <div className="sidebar-view">
      <div className="sidebar-view-header">
        <div className="sidebar-view-header-actions">
          <button
            onClick={handleRunNesting}
            title="Run Nesting"
            style={{ width: 'auto', padding: '0 6px', fontSize: 11 }}
            disabled={pieces.length === 0}
          >
            ▶ Run
          </button>
        </div>
      </div>
      <div className="sidebar-view-content">
        {/* Fabric Dimensions */}
        <Section title="Fabric">
          <div className="sidebar-field-row">
            <span className="sidebar-label">Width (mm)</span>
            <input
              type="number"
              className="sidebar-input sidebar-input-sm"
              value={sheetWidth}
              onChange={(e) => setSheetWidth(+e.target.value)}
            />
          </div>
          <div className="sidebar-field-row">
            <span className="sidebar-label">Height (mm)</span>
            <input
              type="number"
              className="sidebar-input sidebar-input-sm"
              value={sheetHeight}
              onChange={(e) => setSheetHeight(+e.target.value)}
            />
          </div>
          <div className="sidebar-field-row">
            <span className="sidebar-label">Margin (mm)</span>
            <input
              type="number"
              className="sidebar-input sidebar-input-sm"
              value={margin}
              onChange={(e) => setMargin(+e.target.value)}
            />
          </div>
        </Section>

        {/* Settings */}
        <Section title="Settings">
          <div className="sidebar-field-row">
            <span className="sidebar-label">Gap (mm)</span>
            <input
              type="number"
              className="sidebar-input sidebar-input-sm"
              value={gap}
              onChange={(e) => setGap(+e.target.value)}
            />
          </div>
          <div className="sidebar-field-row">
            <span className="sidebar-label">Rotation</span>
            <select
              className="sidebar-select"
              style={{ maxWidth: 100 }}
              value={rotationStep}
              onChange={(e) => setRotationStep(+e.target.value)}
            >
              {ROTATION_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div className="sidebar-field-row">
            <span className="sidebar-label">Mirror</span>
            <label className="sidebar-toggle">
              <input
                type="checkbox"
                checked={allowMirror}
                onChange={() => setAllowMirror(!allowMirror)}
              />
              <span className="sidebar-toggle-slider" />
            </label>
          </div>
          <div className="sidebar-field-row">
            <span className="sidebar-label">Sort</span>
            <select
              className="sidebar-select"
              style={{ maxWidth: 100 }}
              value={sortStrategy}
              onChange={(e) =>
                setSortStrategy(e.target.value as NestingOptions['sortStrategy'])
              }
            >
              {SORT_STRATEGIES.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </Section>

        {/* Run button (full width, for convenience) */}
        <div className="sidebar-section">
          <div className="sidebar-section-body">
            <button
              className="sidebar-btn sidebar-btn-primary sidebar-btn-full"
              onClick={handleRunNesting}
              disabled={pieces.length === 0}
            >
              ▶ Run Nesting
            </button>
            {pieces.length === 0 && (
              <div className="sidebar-info" style={{ marginTop: 4 }}>
                No pieces to layout.
              </div>
            )}
          </div>
        </div>

        {/* Results */}
        {result && (
          <Section title="Result">
            <div className="sidebar-result">
              <div className="sidebar-result-row">
                <span className="sidebar-result-label">Sheets Used</span>
                <span className="sidebar-result-value">{result.sheetsUsed}</span>
              </div>
              <div className="sidebar-result-row">
                <span className="sidebar-result-label">Utilization</span>
                <span className="sidebar-result-value">
                  {(result.utilization * 100).toFixed(1)}%
                </span>
              </div>
              <div className="sidebar-result-row">
                <span className="sidebar-result-label">Unplaced</span>
                <span className="sidebar-result-value">{result.unplaced.length}</span>
              </div>
            </div>
          </Section>
        )}

        {/* SVG Preview */}
        {result && placements.length > 0 && (
          <Section title="Preview">
            <div className="sidebar-svg-preview" style={{ height: 180 }}>
              {previewSvg}
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}
