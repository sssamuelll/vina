/**
 * GradingView — visual size range generation with overlay.
 *
 * Shows all sizes as toggleable layers over the base pattern.
 * One-click batch generation + export.
 */

import { useState, useCallback, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Layers, Plus, X } from 'lucide-react';
import type { RootState } from '../../store';
import { addPiece } from '../../store/projectSlice';
import { batchGrade, generateOverlay, getSizeColor, type GradedSize } from '../../utils/grading/batchGrader';
import type { StandardSize } from '../../utils/seamly2d/sizeTables';
import './GradingView.css';

const ALL_SIZES: StandardSize[] = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'];

export default function GradingView() {
  const dispatch = useDispatch();
  const parametric = useSelector((s: RootState) => s.parametric);
  const { activePattern, currentSize, sizeSystem } = parametric;

  const [selectedSizes, setSelectedSizes] = useState<Set<StandardSize>>(
    new Set(['XS', 'S', 'M', 'L', 'XL'])
  );
  const [overlayData, setOverlayData] = useState<GradedSize[] | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // Toggle a size in the selection
  const toggleSize = useCallback((size: StandardSize) => {
    setSelectedSizes(prev => {
      const next = new Set(prev);
      if (next.has(size)) next.delete(size);
      else next.add(size);
      return next;
    });
  }, []);

  // Generate overlay preview
  const handlePreview = useCallback(() => {
    if (!activePattern) return;
    const data = generateOverlay(activePattern, {
      sizes: Array.from(selectedSizes),
      baseSize: currentSize || 'M',
      sizeSystem,
    });
    setOverlayData(data);
  }, [activePattern, selectedSizes, currentSize, sizeSystem]);

  // Batch grade and add all pieces to project
  const handleGenerate = useCallback(() => {
    if (!activePattern) return;
    setIsGenerating(true);

    try {
      const result = batchGrade(activePattern, {
        sizes: Array.from(selectedSizes),
        baseSize: currentSize || 'M',
        sizeSystem,
      });

      for (const gradedSize of result.sizes) {
        for (const piece of gradedSize.pieces) {
          dispatch(addPiece(piece));
        }
      }

      setIsGenerating(false);
    } catch {
      setIsGenerating(false);
    }
  }, [activePattern, selectedSizes, currentSize, sizeSystem, dispatch]);

  // Clear overlay
  const handleClearOverlay = useCallback(() => {
    setOverlayData(null);
  }, []);

  // Stats
  const stats = useMemo(() => {
    if (!overlayData) return null;
    const totalPieces = overlayData.reduce((sum, s) => sum + s.pieces.length, 0);
    return { sizes: overlayData.length, pieces: totalPieces };
  }, [overlayData]);

  // ─── Empty state ──────────────────────────────────────────────────

  if (!activePattern) {
    return (
      <div className="grading-view">
        <div className="grading-empty">
          <Layers size={32} className="grading-empty-icon" />
          <span className="grading-empty-title">No Template Loaded</span>
          <span className="grading-empty-hint">
            Generate a pattern from a template first, then grade to multiple sizes.
          </span>
        </div>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────

  return (
    <div className="grading-view">
      {/* Header */}
      <div className="grading-header">
        <span className="grading-title">Size Grading</span>
        <span className="grading-base">Base: {currentSize || 'M'}</span>
      </div>

      {/* Size selector grid */}
      <div className="grading-sizes">
        {ALL_SIZES.map(size => {
          const isSelected = selectedSizes.has(size);
          const isBase = size === (currentSize || 'M');
          return (
            <button
              key={size}
              className={`grading-size-btn ${isSelected ? 'grading-size-btn--active' : ''} ${isBase ? 'grading-size-btn--base' : ''}`}
              onClick={() => toggleSize(size)}
              style={isSelected ? { borderColor: getSizeColor(size), color: getSizeColor(size) } : undefined}
            >
              <span className="grading-size-label">{size}</span>
              {isBase && <span className="grading-size-badge">BASE</span>}
            </button>
          );
        })}
      </div>

      {/* Actions */}
      <div className="grading-actions">
        <button
          className="grading-btn grading-btn--preview"
          onClick={handlePreview}
          disabled={selectedSizes.size === 0}
        >
          <Layers size={14} />
          Preview overlay ({selectedSizes.size} sizes)
        </button>
        <button
          className="grading-btn grading-btn--generate"
          onClick={handleGenerate}
          disabled={selectedSizes.size === 0 || isGenerating}
        >
          <Plus size={14} />
          {isGenerating ? 'Generating...' : `Generate ${selectedSizes.size} sizes`}
        </button>
      </div>

      {/* Overlay info */}
      {overlayData && (
        <div className="grading-overlay-info">
          <div className="grading-overlay-header">
            <span>Overlay active</span>
            <button className="grading-overlay-clear" onClick={handleClearOverlay}>
              <X size={12} />
            </button>
          </div>
          {stats && (
            <span className="grading-overlay-stats">
              {stats.sizes} sizes · {stats.pieces} pieces
            </span>
          )}
          <div className="grading-overlay-legend">
            {overlayData.map(s => (
              <div key={s.size} className="grading-legend-item">
                <span className="grading-legend-swatch" style={{ background: s.color }} />
                <span className="grading-legend-label">{s.size}</span>
                <span className="grading-legend-count">{s.pieces.length}pc</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export type { GradedSize };
