import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch, store } from '../../store';
import { getCatalog, getCatalogByCategory, type CatalogEntry, type GarmentCategory } from '../../utils/seamly2d/catalog';
import { useState } from 'react';
import { updatePiece, addSeam } from '../../store/projectSlice';
import { detectSemanticEdges } from '../../utils/semanticEdges';
import { analyzeGarment } from '../../copilot/intelligence/garmentAnalyzer';
import { autoSew } from '../../utils/autoSew';
import type { PatternPiece } from '../../types/types';
import './TemplateLibrary.css';
import { newId } from '../../utils/ids';

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
      const { applyMeasMapping, deriveMeasurements } = await import('../../utils/seamly2d/measurementDerivation');

      // Load the pattern JSON via Vite glob
      const modules = import.meta.glob('../../../tools/seamly2d-converter/output/*.json') as Record<string, () => Promise<{ default: unknown }>>;
      const key = Object.keys(modules).find(k => k.includes(entry.id));
      if (!key) { console.error(`Pattern file not found for ${entry.id}`); return; }
      const mod = await modules[key]();
      const patternData = mod.default as import('../../utils/seamly2d/seamlyAdapter').SeamlyPattern;

      // Build OpenClo-internal-name measurement map from avatar state. Keys
      // match `BodyMeasurements` fields; the mapping to Seamly2D canonical
      // names happens in `applyMeasMapping`, shared with the copilot tool path.
      const m = avatar.measurements;
      const userMeas: Record<string, number | undefined> = {
        chest: m.chest,
        waist: m.waist,
        hips: m.hips,
        shoulderWidth: m.shoulderWidth ?? 40,
        shoulder: m.shoulder ?? m.shoulderWidth ?? 44,
        height: m.height,
        armLength: m.armLength ?? 60,
        inseam: m.inseam ?? 80,
        neckCirc: m.neckCirc,
        kneeHeight: m.kneeHeight,
        waistHeight: m.waistHeight,
        neckToWaistBack: m.neckToWaistBack,
        waistToFloor: m.waistToFloor,
        crotchLength: m.crotchLength,
        kneeCirc: m.kneeCirc,
        ankleCirc: m.ankleCirc,
        wristCirc: m.wristCirc,
      };

      // Translate avatar fields → Seamly2D canonical names, then derive any
      // detail measurements (~10) the pattern references but the user did
      // not supply. Without this, jacket patterns (empty defaults, formulas
      // referencing `bust_arc_f`/`indent_neck_back`/etc.) saw 73% of points
      // collapse to (0,0). Logic shared with seamlyTools.ts via
      // measurementDerivation.ts (#506 follow-up).
      const patternDefaults = patternData.measurements?.defaults ?? {};
      const patternKeys = new Set(Object.keys(patternDefaults));
      const allFormulas = JSON.stringify(patternData.variables ?? {}) + ' ' +
                          JSON.stringify(patternData.construction ?? []);
      const overrides = applyMeasMapping(userMeas, patternKeys, allFormulas);
      Object.assign(overrides, deriveMeasurements({
        userMeas,
        patternDefaults,
        allFormulas,
        patternKeys,
        existingOverrides: overrides,
      }));

      // Adapt Seamly2D pattern with the fully-derived overrides
      const adapted = adaptSeamlyPattern(patternData, overrides);
      dispatch(loadConstruction({
        points: adapted.points,
        lines: [],
        curves: adapted.curves,
        pieces: adapted.pieces,
        variables: adapted.variables ?? {},
      }));

      // Build each piece and add to editor
      const formulaCtx = { measurements: { ...patternDefaults, ...overrides }, variables: adapted.variables ?? {} };
      for (const cPiece of adapted.pieces) {
        const builtPiece = buildPiece(cPiece, adapted.points, adapted.curves, formulaCtx);
        if (builtPiece) {
          dispatch(addPiece(builtPiece));
        }
      }

      // Analyze pieces and create seams
      const pieces = store.getState().project.pieces;
      if (pieces.length >= 2) {
        let classified = false;

        // Try LLM-based analysis first
        try {
          console.log('[TemplateLibrary] Asking AI to analyze garment...');
          const analysis = await analyzeGarment(pieces);

          if (analysis.pieces.length > 0) {
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
            classified = true;

            // Create seams using category + semantic edge name matching
            const reclassifiedPieces = store.getState().project.pieces;
            const findPiece = (cat: string, side?: string) =>
              reclassifiedPieces.find(p => p.category === cat && (!side || p.side === side));
            const findEdge = (piece: PatternPiece | undefined, name: string) =>
              piece?.edges?.find(e => e.name === name);

            const makeSeam = (pA: PatternPiece | undefined, eA: string, pB: PatternPiece | undefined, eB: string) => {
              if (!pA || !pB || !findEdge(pA, eA) || !findEdge(pB, eB)) return;
              dispatch(addSeam({
                id: newId(),
                pieceA: { pieceId: pA.id, edgeName: eA, tStart: 0, tEnd: 1 },
                pieceB: { pieceId: pB.id, edgeName: eB, tStart: 0, tEnd: 1 },
                type: 'standard', tension: 100, strength: 1.0, active: true, taped: false, tapeWidth: 10,
              }));
            };

            const front = findPiece('bodice', 'front');
            const back = findPiece('bodice', 'back');
            const sleeve = findPiece('sleeve');
            makeSeam(front, 'sideSeam', back, 'sideSeam');
            if (sleeve && sleeve.edges) {
              const frontArmhole = findEdge(front, 'armhole');
              const backArmhole = findEdge(back, 'armhole');
              const sleeveEdges = sleeve.edges.filter(e => (e.length ?? 0) > 50);
              if (frontArmhole && sleeveEdges.length > 0) {
                const bestForFront = sleeveEdges.reduce((best, e) =>
                  Math.abs((e.length ?? 0) - (frontArmhole.length ?? 0)) < Math.abs((best.length ?? 0) - (frontArmhole.length ?? 0)) ? e : best
                );
                makeSeam(front, 'armhole', sleeve, bestForFront.name);
                if (backArmhole) {
                  const remaining = sleeveEdges.filter(e => e.name !== bestForFront.name);
                  if (remaining.length > 0) {
                    const bestForBack = remaining.reduce((best, e) =>
                      Math.abs((e.length ?? 0) - (backArmhole.length ?? 0)) < Math.abs((best.length ?? 0) - (backArmhole.length ?? 0)) ? e : best
                    );
                    makeSeam(back, 'armhole', sleeve, bestForBack.name);
                  }
                }
              }
            }
            console.log(`[TemplateLibrary] AI classified ${analysis.pieces.length} pieces, created seams by category matching`);
          }
        } catch (err) {
          console.warn('[TemplateLibrary] AI analysis failed:', err);
        }

        // Fallback: use autoSew (geometric edge-length matching) when LLM is unavailable or returned empty
        if (!classified) {
          console.log('[TemplateLibrary] Using autoSew fallback (no LLM available)...');
          // Ensure edges are detected on all pieces first
          const currentPieces = store.getState().project.pieces;
          for (const piece of currentPieces) {
            if (!piece.edges || piece.edges.length === 0) {
              const updated = { ...piece, edges: detectSemanticEdges(piece) };
              dispatch(updatePiece(updated));
            }
          }
          const piecesWithEdges = store.getState().project.pieces;
          const result = autoSew(piecesWithEdges, { minConfidence: 0.3 });
          for (const proposed of result.seams) {
            if (proposed.seam.pieceA.pieceId !== proposed.seam.pieceB.pieceId) {
              dispatch(addSeam(proposed.seam));
            }
          }
          console.log(`[TemplateLibrary] autoSew created ${result.seams.length} seams (${result.unmatchedEdges.length} unmatched edges)`);
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
