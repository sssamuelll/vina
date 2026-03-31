import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch, store } from '../../store';
import { getCatalog, getCatalogByCategory, type CatalogEntry, type GarmentCategory } from '../../utils/seamly2d/catalog';
import { useState } from 'react';
import { updatePiece, addSeam } from '../../store/projectSlice';
import { detectSemanticEdges } from '../../utils/semanticEdges';
import { analyzeGarment } from '../../copilot/intelligence/garmentAnalyzer';
import type { PatternPiece } from '../../types/types';
import './TemplateLibrary.css';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const CATEGORY_LABELS: Record<GarmentCategory, string> = {
  tops: '👚 Tops',
  bottoms: '👖 Bottoms',
  dresses: '👗 Dresses',
  outerwear: '🧥 Outerwear',
  underwear: '🩱 Underwear',
  blocks: '📐 Blocks',
  sleeves: '🦾 Sleeves',
  other: '📦 Other',
};

export default function TemplateLibrary({ isOpen, onClose }: Props) {
  const avatar = useSelector((s: RootState) => s.project.avatar);
  const [filter, setFilter] = useState<GarmentCategory | 'all'>('all');
  const [loading, setLoading] = useState<string | null>(null);

  const dispatch = useDispatch<AppDispatch>();
  const catalog = filter === 'all' ? getCatalog() : getCatalogByCategory(filter);
  const categories = [...new Set(getCatalog().map(e => e.category))];

  const handleGenerate = async (entry: CatalogEntry) => {
    setLoading(entry.id);
    try {
      // Dynamically import to avoid circular deps and keep initial bundle small
      const { adaptSeamlyPattern } = await import('../../utils/seamly2d/seamlyAdapter');
      const { buildPiece } = await import('../../utils/construction/pieceBuilder');
      const { loadConstruction } = await import('../../store/constructionSlice');
      const { addPiece } = await import('../../store/projectSlice');

      // Load the pattern JSON via Vite glob
      const modules = import.meta.glob('../../../tools/seamly2d-converter/output/*.json') as Record<string, () => Promise<{ default: unknown }>>;
      const key = Object.keys(modules).find(k => k.includes(entry.id));
      if (!key) { console.error(`Pattern file not found for ${entry.id}`); return; }
      const mod = await modules[key]();
      const patternData = mod.default as import('../../utils/seamly2d/seamlyAdapter').SeamlyPattern;

      // Get measurements from avatar state
      const m = avatar.measurements;
      const measurements: Record<string, number> = {
        chest: m.chest,
        waist: m.waist,
        hips: m.hips,
        shoulderWidth: m.shoulderWidth ?? 40,
        height: m.height,
        armLength: m.armLength ?? 60,
        inseam: m.inseam ?? 80,
      };

      // Adapt Seamly2D pattern
      const adapted = adaptSeamlyPattern(patternData, measurements);
      dispatch(loadConstruction({
        points: adapted.points,
        lines: [],
        curves: adapted.curves,
        pieces: adapted.pieces,
        variables: adapted.variables ?? {},
      }));

      // Build each piece and add to editor
      const formulaCtx = { measurements, variables: adapted.variables ?? {} };
      for (const cPiece of adapted.pieces) {
        const builtPiece = buildPiece(cPiece, adapted.points, adapted.curves, formulaCtx);
        if (builtPiece) {
          dispatch(addPiece(builtPiece));
        }
      }

      // Ask the AI to analyze pieces and determine seams
      const pieces = store.getState().project.pieces;
      if (pieces.length >= 2) {
        try {
          console.log('[TemplateLibrary] Asking AI to analyze garment...');
          const analysis = await analyzeGarment(pieces);

          // Apply piece classifications
          for (const classification of analysis.pieces) {
            const piece = pieces.find(p => p.id === classification.id);
            if (!piece) continue;
            const updated = {
              ...piece,
              name: classification.suggestedName,
              category: classification.category as PatternPiece['category'],
              side: (classification.side ?? piece.side) as PatternPiece['side'],
            };
            updated.edges = detectSemanticEdges(updated);
            dispatch(updatePiece(updated));
          }

          // Create seams from AI analysis
          for (const seam of analysis.seams) {
            dispatch(addSeam({
              id: `seam-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              pieceA: { pieceId: seam.pieceAId, edgeName: seam.edgeAName, tStart: 0, tEnd: 1 },
              pieceB: { pieceId: seam.pieceBId, edgeName: seam.edgeBName, tStart: 0, tEnd: 1 },
              type: 'standard', tension: 100, strength: 1.0, active: true, taped: false, tapeWidth: 10,
            }));
          }

          console.log(`[TemplateLibrary] AI classified ${analysis.pieces.length} pieces, created ${analysis.seams.length} seams`);
        } catch (err) {
          console.warn('[TemplateLibrary] AI analysis failed, pieces loaded without seams:', err);
        }
      }

      onClose();
    } catch (err) {
      console.error('[TemplateLibrary] Failed to load pattern:', err);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className={`template-overlay ${isOpen ? 'open' : 'closed'}`} onClick={onClose}>
      <div className="template-library" onClick={e => e.stopPropagation()}>
        <div className="template-header">
          <h2>Seamly2D Pattern Library</h2>
          <p className="template-subtitle">
            {catalog.length} validated patterns • Measurements: {avatar.measurements.chest}cm chest, {avatar.measurements.waist}cm waist
          </p>
          <button className="template-close" onClick={onClose}>✕</button>
        </div>

        <div className="template-filters">
          <button
            className={`template-filter ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >All</button>
          {categories.map(cat => (
            <button
              key={cat}
              className={`template-filter ${filter === cat ? 'active' : ''}`}
              onClick={() => setFilter(cat)}
            >{CATEGORY_LABELS[cat]}</button>
          ))}
        </div>

        <div className="template-grid">
          {catalog.map(entry => (
            <button
              key={entry.id}
              className="template-card"
              onClick={() => handleGenerate(entry)}
              disabled={loading === entry.id}
            >
              <span className="template-complexity" data-level={entry.complexity}>
                {entry.complexity}
              </span>
              <span className="template-name">{entry.name}</span>
              <span className="template-name-es">{entry.nameEs}</span>
              <span className="template-desc">{entry.description}</span>
              <span className="template-meta">
                {entry.gender} • {entry.requiredMeasurements.length} measurements
              </span>
            </button>
          ))}
        </div>

        <div className="template-footer">
          <span className="template-hint">
            💡 These are real patterns from Seamly2D — validated construction, not AI-generated shapes
          </span>
        </div>
      </div>
    </div>
  );
}
