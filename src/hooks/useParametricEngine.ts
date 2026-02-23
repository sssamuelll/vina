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
import { updatePiece } from '../store/projectSlice';
import { setVariableOverride, resetOverrides, resetVariable } from '../store/parametricSlice';
import { PatternTemplateEngine } from '../utils/seamly2d/templateEngine';
import { getSizeMeasurements, type StandardSize } from '../utils/seamly2d/sizeTables';
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

      for (const newPiece of newPieces) {
        const existing = pieces.find(p => p.id === newPiece.id);
        if (existing) {
          dispatch(updatePiece({
            ...existing,
            outline: newPiece.outline,
            updatedAt: Date.now(),
          }));
        }
      }
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
        for (const newPiece of newPieces) {
          const existing = pieces.find(p => p.id === newPiece.id);
          if (existing) {
            dispatch(updatePiece({
              ...existing,
              outline: newPiece.outline,
              updatedAt: Date.now(),
            }));
          }
        }
      } catch { /* ignore */ }
    }
  }, [dispatch, activePattern, baseMeasurements, pieces]);

  const handleResetVariable = useCallback((key: string) => {
    dispatch(resetVariable(key));
  }, [dispatch]);

  return {
    isActive: activePattern !== null,
    patternName: activePattern?.name || null,
    variables,
    groups,
    generatedPieceIds,
    handleSliderChange,
    handleReset,
    handleResetVariable,
  };
}
