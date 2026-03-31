import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch, store } from '../../store';
import { getCatalog, getCatalogByCategory, type CatalogEntry, type GarmentCategory } from '../../utils/seamly2d/catalog';
import { useState } from 'react';
import { updatePiece, addSeam } from '../../store/projectSlice';
import { detectSemanticEdges } from '../../utils/semanticEdges';
import type { PatternPiece, PathCommand } from '../../types/types';
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

function pieceBBox(outline: PathCommand[]): { width: number; height: number } {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  let cx = 0, cy = 0;
  for (const cmd of outline) {
    let ex = cx, ey = cy;
    switch (cmd.type) {
      case 'M': case 'L': ex = cmd.values[0]; ey = cmd.values[1]; break;
      case 'H': ex = cmd.values[0]; break;
      case 'V': ey = cmd.values[0]; break;
      case 'C': ex = cmd.values[4]; ey = cmd.values[5]; break;
      case 'Q': ex = cmd.values[2]; ey = cmd.values[3]; break;
      default: continue;
    }
    minX = Math.min(minX, ex); maxX = Math.max(maxX, ex);
    minY = Math.min(minY, ey); maxY = Math.max(maxY, ey);
    cx = ex; cy = ey;
  }
  return { width: maxX - minX, height: maxY - minY };
}

function approxArea(outline: PathCommand[]): number {
  let cx = 0, cy = 0, area = 0;
  for (const cmd of outline) {
    let ex = cx, ey = cy;
    switch (cmd.type) {
      case 'M': case 'L': ex = cmd.values[0]; ey = cmd.values[1]; break;
      case 'H': ex = cmd.values[0]; break;
      case 'V': ey = cmd.values[0]; break;
      case 'C': ex = cmd.values[4]; ey = cmd.values[5]; break;
      case 'Q': ex = cmd.values[2]; ey = cmd.values[3]; break;
      case 'Z': continue;
      default: continue;
    }
    area += cx * ey - ex * cy;
    cx = ex; cy = ey;
  }
  return Math.abs(area) / 2;
}

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

      // Auto-rename duplicate pieces using geometry analysis
      const pieces = store.getState().project.pieces;
      const uniqueNames = new Set(pieces.map(p => p.name));
      if (uniqueNames.size === 1 && pieces.length >= 2) {
        const analyzed = pieces.map(p => {
          const area = approxArea(p.outline);
          const bbox = pieceBBox(p.outline);
          const hasCurves = p.outline.some(c => c.type === 'C' || c.type === 'Q' || c.type === 'S');
          const aspectRatio = bbox.height > 0 ? bbox.width / bbox.height : 1;
          return { piece: p, area, bbox, hasCurves, aspectRatio };
        });

        // Classify using original piece ORDER from Seamly2D:
        // Convention: bodice pieces come first, then sleeves, then small pieces (collar/neckband)
        // We identify bands first (very narrow), then use piece index order for the rest
        const bands = analyzed.filter(a => a.aspectRatio > 5 || a.aspectRatio < 0.15);
        const nonBands = analyzed.filter(a => !bands.includes(a));
        // Sort non-bands by original index (piece order from Seamly2D)
        nonBands.sort((a, b) => pieces.indexOf(a.piece) - pieces.indexOf(b.piece));
        // First 2 large non-bands (area > 30% of max) = bodice front/back
        const maxArea = Math.max(...nonBands.map(a => a.area));
        const large = nonBands.filter(a => a.area > maxArea * 0.3).slice(0, 2);
        const medium: typeof analyzed = [];
        const remaining = nonBands.filter(a => !large.includes(a));

        const renames: Array<{ piece: PatternPiece; name: string; category: string; side?: string }> = [];

        // Largest pieces = bodice front/back
        if (large.length >= 2) {
          // Wider one is usually front (has more ease/dart room)
          const [wider, narrower] = large[0].bbox.width >= large[1].bbox.width ? [large[0], large[1]] : [large[1], large[0]];
          renames.push({ piece: wider.piece, name: 'Front Bodice', category: 'bodice', side: 'front' });
          renames.push({ piece: narrower.piece, name: 'Back Bodice', category: 'bodice', side: 'back' });
        } else if (large.length === 1) {
          renames.push({ piece: large[0].piece, name: 'Bodice', category: 'bodice' });
        }

        // Remaining non-band pieces sorted by area = sleeves (or other medium pieces)
        const sleeveCandidates = [...medium, ...remaining].filter(a => !bands.includes(a));
        sleeveCandidates.sort((a, b) => b.area - a.area);
        sleeveCandidates.forEach((s, i) => {
          renames.push({ piece: s.piece, name: i === 0 ? 'Sleeve' : `Sleeve ${i + 1}`, category: 'sleeve', side: i === 0 ? 'left' : 'right' });
        });

        // Narrow strips = neckband / binding
        bands.forEach((b, i) => {
          renames.push({ piece: b.piece, name: i === 0 ? 'Neckband' : `Band ${i + 1}`, category: 'collar' });
        });

        // Anything unclassified
        const classified = new Set(renames.map(r => r.piece.id));
        analyzed.filter(a => !classified.has(a.piece.id)).forEach((a, i) => {
          renames.push({ piece: a.piece, name: `Piece ${i + 1}`, category: 'other' });
        });

        for (const r of renames) {
          const updated = { ...r.piece, name: r.name, category: r.category as PatternPiece['category'], side: (r.side ?? r.piece.side) as PatternPiece['side'] };
          updated.edges = detectSemanticEdges(updated);
          dispatch(updatePiece(updated));
        }
      }

      // Create seams by matching piece names + edge names
      const updatedPieces = store.getState().project.pieces;
      if (store.getState().project.seams.length === 0 && updatedPieces.length >= 2) {
        const front = updatedPieces.find(p => p.category === 'bodice' && p.side === 'front');
        const back = updatedPieces.find(p => p.category === 'bodice' && p.side === 'back');
        const sleeve = updatedPieces.find(p => p.category === 'sleeve');

        const makeSeam = (pA: PatternPiece | undefined, eA: string, pB: PatternPiece | undefined, eB: string) => {
          if (!pA || !pB) return;
          if (!pA.edges?.find(e => e.name === eA) || !pB.edges?.find(e => e.name === eB)) return;
          dispatch(addSeam({
            id: `seam-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            pieceA: { pieceId: pA.id, edgeName: eA, tStart: 0, tEnd: 1 },
            pieceB: { pieceId: pB.id, edgeName: eB, tStart: 0, tEnd: 1 },
            type: 'standard', tension: 100, strength: 1.0, active: true, taped: false, tapeWidth: 10,
          }));
        };

        // Side seam: front sideSeam ↔ back sideSeam
        makeSeam(front, 'sideSeam', back, 'sideSeam');
        // Sleeve to front armhole
        makeSeam(front, 'armhole', sleeve, 'sleeveCap');
        // Sleeve to back armhole
        makeSeam(back, 'armhole', sleeve, 'sleeveCap');
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
