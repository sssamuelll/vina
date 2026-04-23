/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
/**
 * useParametricEngine — connects ParametricView sliders to the template engine.
 *
 * Handles:
 * - Deriving slider min/max from size tables (XS→3XL spread)
 * - Debounced regeneration on variable changes
 * - Undo-friendly batched piece updates
 */

import { useCallback, useMemo, useRef, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../store';
import { updatePiece, addSeam } from '../store/projectSlice';
import { setVariableOverride, resetOverrides, resetVariable, activateTemplate } from '../store/parametricSlice';
import { PatternTemplateEngine } from '../utils/seamly2d/templateEngine';
import { resolveVariables } from '../utils/seamly2d/formulaEvaluator';
import { getSizeMeasurements, buildMeasurements, getAvailableSizes, type StandardSize } from '../utils/seamly2d/sizeTables';
import { autoSew } from '../utils/autoSew';
// ─── Types ──────────────────────────────────────────────────────────────────

export type SliderCategory = 'fit' | 'length' | 'proportions' | 'ease' | 'construction';

export interface ParametricVariable {
  key: string;
  label: string;
  category: SliderCategory;
  unit: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  currentValue: number;
  description: string;
  isOverridden: boolean;
}

const CATEGORY_ORDER: Record<SliderCategory, number> = {
  fit: 0, length: 1, proportions: 2, ease: 3, construction: 4,
};
type ProjectPiece = RootState['project']['pieces'][number];
type GeneratedPieceLike = Pick<ProjectPiece, 'id' | 'outline'>;

// ─── Helpers ────────────────────────────────────────────────────────────────

function categorizeVariable(key: string, desc: string): SliderCategory {
  const k = key.toLowerCase();
  const d = desc.toLowerCase();
  if (k.includes('ease') || d.includes('ease')) return 'ease';
  if (k.includes('height') || k.includes('length') || k.includes('hemline') || k.includes('drop')) return 'length';
  if (k.includes('width') || k.includes('circumf') || k.includes('intake') || k.includes('bust') || k.includes('waist')) return 'fit';
  if (k.includes('front') || k.includes('back') || k.includes('arm') || k.includes('neck') || k.includes('yoke') || k.includes('shoulder')) return 'proportions';
  return 'construction';
}

function makeLabel(key: string): string {
  return key
    .replace(/^#/, '')
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]/g, ' ')
    .trim()
    .replace(/^\w/, c => c.toUpperCase());
}

function isHiddenVariable(key: string, formula: string): boolean {
  const k = key.toLowerCase();
  if (k.includes('modification') || k.includes('tobeverified') || k.includes('primarymeasure') || k.includes('auxiliarymeasure')) return true;
  if (/^[0\-\s]+$/.test(formula)) return true;
  return false;
}

/**
 * Derive min/max for a variable by evaluating the pattern at XS and 3XL sizes.
 * Falls back to ±60% of the default value.
 */
function deriveRange(
  defaultValue: number,
  key: string,
  sizeRangeValues: Map<string, { min: number; max: number }>,
): { min: number; max: number } {
  const sizeRange = sizeRangeValues.get(key);
  if (sizeRange && sizeRange.min !== sizeRange.max) {
    // Add 20% padding beyond the XS→3XL range
    const spread = sizeRange.max - sizeRange.min;
    return {
      min: Math.max(0, Math.round((sizeRange.min - spread * 0.2) * 10) / 10),
      max: Math.round((sizeRange.max + spread * 0.2) * 10) / 10,
    };
  }
  // Fallback: ±60% of default
  const base = defaultValue || 10;
  return {
    min: Math.max(0, Math.round(base * 0.4 * 10) / 10),
    max: Math.round(base * 1.6 * 10) / 10,
  };
}

function buildSortedPieceIndex(pieces: readonly ProjectPiece[]): ProjectPiece[] {
  return [...pieces].sort((a, b) => a.id.localeCompare(b.id));
}

function findPieceById(sortedPieces: readonly ProjectPiece[], pieceId: string): ProjectPiece | undefined {
  let low = 0;
  let high = sortedPieces.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const midId = sortedPieces[mid].id;
    const compare = midId.localeCompare(pieceId);

    if (compare === 0) return sortedPieces[mid];
    if (compare < 0) low = mid + 1;
    else high = mid - 1;
  }

  return undefined;
}

function syncGeneratedPieces(
  generatedPieces: readonly GeneratedPieceLike[],
  existingPieces: readonly ProjectPiece[],
  dispatch: AppDispatch,
): void {
  const sortedPieces = buildSortedPieceIndex(existingPieces);

  for (const generatedPiece of generatedPieces) {
    const existing = findPieceById(sortedPieces, generatedPiece.id);
    if (!existing) continue;

    dispatch(updatePiece({
      ...existing,
      outline: generatedPiece.outline,
      updatedAt: Date.now(),
    }));
  }
}

// ─── Hook ───────────────────────────────────────────────────────────────────

const DEBOUNCE_MS = 80;

export function useParametricEngine() {
  const dispatch = useDispatch<AppDispatch>();
  const parametric = useSelector((s: RootState) => s.parametric);
  const pieces = useSelector((s: RootState) => s.project.pieces);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { activePattern, baseMeasurements, variableDefaults, variableOverrides, sizeSystem, generatedPieceIds } = parametric;

  // Pre-compute size-table-based ranges for all variables
  const sizeRangeValues = useMemo(() => {
    if (!activePattern || !baseMeasurements) return new Map<string, { min: number; max: number }>();

    const sizes: StandardSize[] = ['XS', '3XL'];
    const engine = new PatternTemplateEngine();
    const rangeMap = new Map<string, { min: number; max: number }>();

    try {
      for (const size of sizes) {
        const sizeMeas = getSizeMeasurements(size, sizeSystem);
        if (!sizeMeas) continue;

        engine.loadPattern({ ...activePattern });

        // We can't easily get resolved variables without exposing the engine internals,
        // so we evaluate each variable formula at the size extremes using measurement diffs
        // For now, use the measurement ratios to scale variable defaults
        const ratio = (sizeMeas.chest || baseMeasurements.chest) / baseMeasurements.chest;

        for (const [key, val] of Object.entries(variableDefaults)) {
          const scaled = val * ratio;
          const existing = rangeMap.get(key);
          if (!existing) {
            rangeMap.set(key, { min: scaled, max: scaled });
          } else {
            rangeMap.set(key, {
              min: Math.min(existing.min, scaled),
              max: Math.max(existing.max, scaled),
            });
          }
        }
      }
    } catch {
      // Fall through to fallback ranges
    }

    return rangeMap;
  }, [activePattern, baseMeasurements, variableDefaults, sizeSystem]);

  // Build the variable list
  const variables = useMemo((): ParametricVariable[] => {
    if (!activePattern) return [];

    const vars: ParametricVariable[] = [];

    for (const [key, def] of Object.entries(activePattern.variables)) {
      if (isHiddenVariable(key, def.formula)) continue;

      const defaultValue = variableDefaults[key] ?? 0;
      const currentValue = variableOverrides[key] ?? defaultValue;
      const category = categorizeVariable(key, def.description || '');
      const { min, max } = deriveRange(defaultValue, key, sizeRangeValues);
      const unit = activePattern.unit === 'cm' ? 'cm' : 'mm';

      vars.push({
        key,
        label: makeLabel(key),
        category,
        unit,
        min,
        max,
        step: unit === 'cm' ? 0.1 : 1,
        defaultValue,
        currentValue,
        description: def.description || '',
        isOverridden: key in variableOverrides,
      });
    }

    return vars.sort((a, b) => {
      const catDiff = CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category];
      return catDiff !== 0 ? catDiff : a.label.localeCompare(b.label);
    });
  }, [activePattern, variableDefaults, variableOverrides, sizeRangeValues]);

  // Group by category
  const groups = useMemo(() => {
    const map = new Map<SliderCategory, ParametricVariable[]>();
    for (const v of variables) {
      const arr = map.get(v.category) || [];
      arr.push(v);
      map.set(v.category, arr);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => CATEGORY_ORDER[a] - CATEGORY_ORDER[b]);
  }, [variables]);

  // Debounced regeneration
  const regenerate = useCallback(() => {
    if (!activePattern || !baseMeasurements) return;

    const engine = new PatternTemplateEngine();

    // Build modified pattern with overrides applied to variable formulas
    const modifiedVars = { ...activePattern.variables };
    for (const [key, value] of Object.entries(variableOverrides)) {
      if (modifiedVars[key]) {
        modifiedVars[key] = { ...modifiedVars[key], formula: String(value) };
      }
    }

    engine.loadPattern({ ...activePattern, variables: modifiedVars });

    try {
      const newPieces = engine.generate(baseMeasurements);
      syncGeneratedPieces(newPieces, pieces, dispatch);
    } catch {
      // Formula evaluation error at extreme values — ignore
    }
  }, [activePattern, baseMeasurements, variableOverrides, pieces, dispatch]);

  // Trigger debounced regeneration when overrides change
  useEffect(() => {
    if (Object.keys(variableOverrides).length === 0) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(regenerate, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [variableOverrides, regenerate]);

  // Actions
  const handleSliderChange = useCallback((key: string, value: number) => {
    dispatch(setVariableOverride({ key, value }));
  }, [dispatch]);

  const handleReset = useCallback(() => {
    dispatch(resetOverrides());
    // Regenerate with defaults
    if (activePattern && baseMeasurements) {
      const engine = new PatternTemplateEngine();
      engine.loadPattern(activePattern);
      try {
        const newPieces = engine.generate(baseMeasurements);
        syncGeneratedPieces(newPieces, pieces, dispatch);
      } catch { /* ignore */ }
    }
  }, [dispatch, activePattern, baseMeasurements, pieces]);

  const handleResetVariable = useCallback((key: string) => {
    dispatch(resetVariable(key));
  }, [dispatch]);

  // Change size — re-generate from scratch with new measurements
  const handleChangeSize = useCallback((newSize: StandardSize) => {
    if (!activePattern) return;

    const measurements = buildMeasurements(newSize, sizeSystem);
    const engine = new PatternTemplateEngine();
    engine.loadPattern(activePattern);

    try {
      const newPieces = engine.generate(measurements);

      // Resolve variables at new size for slider defaults
      const measMap: Record<string, number> = {};
      for (const [k, v] of Object.entries(measurements)) {
        if (typeof v === 'number') measMap[k] = v;
      }
      if (activePattern.measurements?.defaults) {
        for (const [k, v] of Object.entries(activePattern.measurements.defaults)) {
          if (measMap[k] === undefined) measMap[k] = v;
        }
      }
      const resolvedVars = resolveVariables(activePattern.variables, measMap);

      // Update pieces in place
      syncGeneratedPieces(newPieces, pieces, dispatch);

      // Re-activate template with new defaults
      dispatch(activateTemplate({
        pattern: activePattern,
        measurements,
        size: newSize,
        sizeSystem,
        resolvedVariables: resolvedVars,
        pieceIds: newPieces.map(p => p.id),
      }));

      // Re-match seams if we have multiple pieces
      if (newPieces.length >= 2) {
        reMatchSeams(newPieces);
      }
    } catch { /* ignore */ }
  }, [activePattern, sizeSystem, pieces, dispatch]);

  // Re-match seams when edges change significantly
  const reMatchSeams = useCallback((updatedPieces: typeof pieces) => {
    if (updatedPieces.length < 2) return;

    try {
      const result = autoSew(updatedPieces);
      const genIds = new Set(generatedPieceIds);

      for (const proposed of result.seams) {
        if (proposed.confidence >= 0.6) {
          const isOurPiece = genIds.has(proposed.seam.pieceA.pieceId) || genIds.has(proposed.seam.pieceB.pieceId);
          if (isOurPiece) {
            dispatch(addSeam(proposed.seam));
          }
        }
      }
    } catch { /* auto-sew failure is non-critical */ }
  }, [generatedPieceIds, dispatch]);

  // Available sizes for the selector
  const availableSizes = useMemo(() => getAvailableSizes(sizeSystem), [sizeSystem]);

  return {
    isActive: activePattern !== null,
    patternName: activePattern?.name || null,
    currentSize: parametric.currentSize,
    availableSizes,
    variables,
    groups,
    generatedPieceIds,
    handleSliderChange,
    handleReset,
    handleResetVariable,
    handleChangeSize,
  };
}
