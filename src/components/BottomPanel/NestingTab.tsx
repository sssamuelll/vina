/**
 * NestingTab — Bottom-panel tab showing fabric nesting preview with canvas.
 *
 * Features:
 * - Nest button to run skyline bin-packing
 * - Roll width presets (90/112/150 cm) + custom
 * - Gap input (mm)
 * - Canvas rendering of placed pieces on fabric roll
 * - Stats: used length, utilization, waste
 * - Empty state when no nesting result
 */

import { useCallback, useRef, useEffect, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../../store';
import { setNestingConfig, setNestingResult, clearNesting } from '../../store/nestingSlice';
import { nestPieces, computeArea, computeBBox } from '../../utils/nesting/nestingEngine';
import { flattenPath } from '../../utils/seam/index';
import type { Point2D } from '../../types/types';
import './NestingTab.css';

// ─── Constants ──────────────────────────────────────────────────────────────

const ROLL_WIDTHS = [
  { label: '90 cm', value: 900 },
  { label: '112 cm', value: 1120 },
  { label: '150 cm', value: 1500 },
];

const PIECE_FILL_COLORS = [
  '#6b9bd2', '#e8a87c', '#85c88a', '#c084cf',
  '#e06c75', '#d4a843', '#56b6c2', '#c678dd',
  '#98c379', '#e5c07b', '#61afef', '#be5046',
];

const PIECE_STROKE_COLORS = [
  '#4a7ab2', '#c8885c', '#65a86a', '#a064af',
  '#c04c55', '#b48823', '#36969f', '#a658bd',
  '#78a359', '#c5a05b', '#418fcf', '#9e3026',
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function rotatePoints(points: Point2D[], angleDeg: number): Point2D[] {
  if (angleDeg === 0) return points;
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return points.map(p => ({
    x: p.x * cos - p.y * sin,
    y: p.x * sin + p.y * cos,
  }));
}

function computeUsedLength(
  placements: Array<{ pieceId: string; x: number; y: number; rotation: number }>,
  pieceMap: Map<string, Point2D[]>,
): number {
  let maxY = 0;
  for (const placement of placements) {
    const pts = pieceMap.get(placement.pieceId);
    if (!pts) continue;
    const rotated = rotatePoints(pts, placement.rotation);
    const bbox = computeBBox(rotated);
    const bottomY = placement.y + bbox.height;
    if (bottomY > maxY) maxY = bottomY;
  }
  return maxY;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function NestingTab() {
  const dispatch = useDispatch<AppDispatch>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Redux state
  const config = useSelector((s: RootState) => s.nesting.config);
  const result = useSelector((s: RootState) => s.nesting.result);
  const usedLength = useSelector((s: RootState) => s.nesting.usedLength);
  const wastePercent = useSelector((s: RootState) => s.nesting.wastePercent);
  const pieces = useSelector((s: RootState) => s.project.pieces);

  // Active pieces
  const activePieces = useMemo(
    () => pieces.filter(p => p.active !== false),
    [pieces],
  );

  // Piece name map for canvas labels
  const pieceNameMap = useMemo(
    () => new Map(activePieces.map(p => [p.id, p.name])),
    [activePieces],
  );

  // Flattened outlines for rendering
  const pieceOutlineMap = useMemo(
    () => new Map(activePieces.map(p => [p.id, flattenPath(p.outline)])),
    [activePieces],
  );

  // ─── Roll width select value ─────────────────────────────────────────────

  const rollWidthSelectValue = useMemo(() => {
    const preset = ROLL_WIDTHS.find(rw => rw.value === config.rollWidth);
    return preset ? String(preset.value) : 'custom';
  }, [config.rollWidth]);

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleNest = useCallback(() => {
    if (activePieces.length === 0) return;

    const totalPieceArea = activePieces.reduce(
      (sum, p) => sum + computeArea(p.outline),
      0,
    );

    const sheetHeight = Math.max(10000, (totalPieceArea / config.rollWidth) * 3);

    const nestResult = nestPieces(activePieces, {
      sheet: { width: config.rollWidth, height: sheetHeight, margin: config.gap / 2 },
      gap: config.gap,
      rotationStep: config.rotationStep,
      allowMirror: config.allowMirror,
      sortStrategy: 'area-desc',
    });

    const used = computeUsedLength(nestResult.placements, pieceOutlineMap);
    const rollArea = config.rollWidth * used;
    const waste = rollArea > 0
      ? ((rollArea - totalPieceArea) / rollArea) * 100
      : 0;

    dispatch(setNestingResult({ result: nestResult, usedLength: used, wastePercent: waste }));
  }, [activePieces, config, pieceOutlineMap, dispatch]);

  const handleRollWidthChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val !== 'custom') {
      dispatch(setNestingConfig({ rollWidth: Number(val) }));
    }
  }, [dispatch]);

  const handleCustomRollWidth = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (val > 0) {
      dispatch(setNestingConfig({ rollWidth: val }));
    }
  }, [dispatch]);

  const handleGapChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (val >= 0) {
      dispatch(setNestingConfig({ gap: val }));
    }
  }, [dispatch]);

  const handleClear = useCallback(() => {
    dispatch(clearNesting());
  }, [dispatch]);

  // ─── Canvas rendering ─────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !result || usedLength == null || usedLength <= 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    const canvasW = rect.width;
    const canvasH = rect.height;

    canvas.width = canvasW * dpr;
    canvas.height = canvasH * dpr;
    canvas.style.width = `${canvasW}px`;
    canvas.style.height = `${canvasH}px`;
    ctx.scale(dpr, dpr);

    // Clear
    ctx.clearRect(0, 0, canvasW, canvasH);

    // Compute scale to fit
    const padding = 16;
    const availW = canvasW - padding * 2;
    const availH = canvasH - padding * 2;
    const rollW = config.rollWidth;
    const rollH = usedLength;
    const scale = Math.min(availW / rollW, availH / rollH);
    const offsetX = padding + (availW - rollW * scale) / 2;
    const offsetY = padding;

    // Draw roll background
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(offsetX, offsetY, rollW * scale, rollH * scale);
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1;
    ctx.strokeRect(offsetX, offsetY, rollW * scale, rollH * scale);

    // Draw each placed piece
    for (let i = 0; i < result.placements.length; i++) {
      const placement = result.placements[i];
      const pts = pieceOutlineMap.get(placement.pieceId);
      if (!pts || pts.length === 0) continue;

      // Rotate points
      const rotated = rotatePoints(pts, placement.rotation);
      const bbox = computeBBox(rotated);

      // Normalize to origin (0,0)
      const normalized = rotated.map(p => ({
        x: p.x - bbox.minX,
        y: p.y - bbox.minY,
      }));

      const fillColor = PIECE_FILL_COLORS[i % PIECE_FILL_COLORS.length];
      const strokeColor = PIECE_STROKE_COLORS[i % PIECE_STROKE_COLORS.length];

      // Draw filled polygon
      ctx.beginPath();
      for (let j = 0; j < normalized.length; j++) {
        const sx = offsetX + (placement.x + normalized[j].x) * scale;
        const sy = offsetY + (placement.y + normalized[j].y) * scale;
        if (j === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.closePath();
      ctx.fillStyle = fillColor;
      ctx.globalAlpha = 0.7;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 1;
      ctx.stroke();

      // Draw piece name label
      const name = pieceNameMap.get(placement.pieceId) ?? placement.pieceId;
      const centerX = offsetX + (placement.x + bbox.width / 2) * scale;
      const centerY = offsetY + (placement.y + bbox.height / 2) * scale;

      ctx.font = `${Math.max(8, Math.min(11, bbox.width * scale * 0.08))}px sans-serif`;
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(name, centerX, centerY);
    }

    // Draw roll dimensions label
    ctx.font = '10px sans-serif';
    ctx.fillStyle = '#888';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(
      `${(rollW / 10).toFixed(0)} cm x ${(rollH / 10).toFixed(1)} cm`,
      offsetX + (rollW * scale) / 2,
      offsetY + rollH * scale + 4,
    );
  }, [result, usedLength, config.rollWidth, pieceOutlineMap, pieceNameMap]);

  // Resize observer for canvas redraws
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      // Force re-render by touching a dependency — the effect above will re-run
      // via the dependency on result (which hasn't changed), but we need to
      // trigger canvas re-render. We do this by dispatching a no-op.
      // Instead, just re-trigger the render via a ref.
      if (canvasRef.current && result) {
        canvasRef.current.dispatchEvent(new Event('resize'));
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [result]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="nesting-tab">
      {/* Toolbar */}
      <div className="nesting-toolbar">
        <button onClick={handleNest} disabled={activePieces.length === 0}>
          Crear marcada
        </button>
        {result && (
          <button onClick={handleClear}>Limpiar marcada</button>
        )}

        <label>
          Rollo:
          <select value={rollWidthSelectValue} onChange={handleRollWidthChange}>
            {ROLL_WIDTHS.map(rw => (
              <option key={rw.value} value={String(rw.value)}>{rw.label}</option>
            ))}
            <option value="custom">Personalizado</option>
          </select>
        </label>

        {rollWidthSelectValue === 'custom' && (
          <label className="nesting-unit-input">
            <input
              type="number"
              value={config.rollWidth}
              min={100}
              step={10}
              onChange={handleCustomRollWidth}
              aria-label="Ancho de rollo personalizado en milímetros"
            />
            <span className="nesting-unit-suffix">mm</span>
          </label>
        )}

        <label className="nesting-unit-input">
          Separación:
          <input
            type="number"
            value={config.gap}
            min={0}
            step={1}
            onChange={handleGapChange}
            aria-label="Separación entre piezas en milímetros"
          />
          <span className="nesting-unit-suffix">mm</span>
        </label>

        {/* Stats */}
        {result && usedLength != null && wastePercent != null && (
          <div className="nesting-stats">
            <span className="nesting-stat">
              Largo: <strong>{(usedLength / 10).toFixed(1)} cm</strong>
            </span>
            <span className="nesting-stat">
              Aprovechamiento: <strong>{(100 - wastePercent).toFixed(1)}%</strong>
            </span>
            <span className="nesting-stat">
              Desperdicio: <strong>{wastePercent.toFixed(1)}%</strong>
            </span>
          </div>
        )}
      </div>

      {/* Canvas or empty state */}
      {result ? (
        <div className="nesting-canvas-container" ref={containerRef}>
          <canvas className="nesting-canvas" ref={canvasRef} />
        </div>
      ) : (
        <div className="nesting-empty">
          {activePieces.length === 0
            ? 'No hay piezas activas para la marcada.'
            : "Haz clic en 'Crear marcada' para colocar las piezas en el rollo de tela."}
        </div>
      )}
    </div>
  );
}
