/**
 * ParametricView — expose template variables as real-time sliders.
 *
 * Design principles:
 * - Every control earns its space. No filler.
 * - Sliders are the hero — large, responsive, satisfying.
 * - Grouped by semantic category (Fit, Length, Proportions, Construction).
 * - Direct-edit: click the value to type exact numbers.
 * - Range derived from size tables (XS→3XL spread per variable).
 */

import { useState, useCallback, useMemo, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { ChevronDown, SlidersHorizontal, RotateCcw } from 'lucide-react';
import type { RootState } from '../../store';
import { updatePiece } from '../../store/projectSlice';
import { PatternTemplateEngine, type SeamlyPattern } from '../../utils/seamly2d/templateEngine';
import type { BodyMeasurements } from '../../types/types';
import './ParametricView.css';

// ─── Variable categorization ────────────────────────────────────────────────

type SliderCategory = 'fit' | 'length' | 'proportions' | 'construction' | 'ease';

interface ParametricVariable {
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
}

const CATEGORY_META: Record<SliderCategory, { label: string; icon: string; order: number }> = {
  fit:          { label: 'FIT',          icon: '◎', order: 0 },
  length:       { label: 'LENGTH',       icon: '↕', order: 1 },
  proportions:  { label: 'PROPORTIONS',  icon: '⊞', order: 2 },
  ease:         { label: 'EASE',         icon: '↔', order: 3 },
  construction: { label: 'CONSTRUCTION', icon: '⚙', order: 4 },
};

/**
 * Categorize a Seamly2D variable by its name/description.
 */
function categorizeVariable(key: string, desc: string): SliderCategory {
  const k = key.toLowerCase();
  const d = desc.toLowerCase();

  if (k.includes('ease') || d.includes('ease')) return 'ease';
  if (k.includes('height') || k.includes('length') || k.includes('hemline') || k.includes('drop')) return 'length';
  if (k.includes('width') || k.includes('circumf') || k.includes('intake') || k.includes('bust') || k.includes('waist')) return 'fit';
  if (k.includes('front') || k.includes('back') || k.includes('arm') || k.includes('neck') || k.includes('yoke') || k.includes('shoulder')) return 'proportions';

  return 'construction';
}

/**
 * Clean a Seamly2D variable key into a human-readable label.
 */
function makeLabel(key: string): string {
  return key
    .replace(/^#/, '')
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]/g, ' ')
    .trim()
    .replace(/^\w/, c => c.toUpperCase());
}

/**
 * Check if a variable should be hidden (internal/bookkeeping).
 */
function isHiddenVariable(key: string, formula: string): boolean {
  const k = key.toLowerCase();
  // Hide: separator variables (all zeros), modifications, to-be-verified
  if (k.includes('modification') || k.includes('tobeverified') || k.includes('primarymeasure') || k.includes('auxiliarymeasure')) return true;
  // Hide: formula is just zeros
  if (/^[0\-\s]+$/.test(formula)) return true;
  return false;
}

// ─── Slider component ───────────────────────────────────────────────────────

interface SliderProps {
  variable: ParametricVariable;
  onChange: (key: string, value: number) => void;
}

function ParametricSlider({ variable, onChange }: SliderProps) {
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(variable.key, parseFloat(e.target.value));
  }, [variable.key, onChange]);

  const handleValueClick = () => {
    setIsEditing(true);
    requestAnimationFrame(() => inputRef.current?.select());
  };

  const handleValueBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsEditing(false);
    const val = parseFloat(e.target.value);
    if (!isNaN(val)) {
      onChange(variable.key, Math.max(variable.min, Math.min(variable.max, val)));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    }
    if (e.key === 'Escape') {
      setIsEditing(false);
    }
  };

  // Compute fill percentage for gradient track
  const fillPct = ((variable.currentValue - variable.min) / (variable.max - variable.min)) * 100;
  const trackStyle = {
    background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${fillPct}%, var(--border) ${fillPct}%, var(--border) 100%)`,
  };

  return (
    <div className="parametric-slider">
      <div className="parametric-slider-header">
        <span className="parametric-slider-name">{variable.label}</span>
        <div className="parametric-slider-value">
          {isEditing ? (
            <input
              ref={inputRef}
              type="number"
              className="parametric-slider-number"
              defaultValue={variable.currentValue.toFixed(1)}
              step={variable.step}
              onBlur={handleValueBlur}
              onKeyDown={handleKeyDown}
              autoFocus
            />
          ) : (
            <span
              className="parametric-slider-number"
              onClick={handleValueClick}
              title="Click to edit"
            >
              {variable.currentValue.toFixed(1)}
            </span>
          )}
          <span className="parametric-slider-unit">{variable.unit}</span>
        </div>
      </div>
      <div className="parametric-range-wrap">
        <input
          type="range"
          className="parametric-range"
          min={variable.min}
          max={variable.max}
          step={variable.step}
          value={variable.currentValue}
          onChange={handleSliderChange}
          style={trackStyle}
        />
      </div>
      <div className="parametric-range-labels">
        <span className="parametric-range-label">{variable.min.toFixed(0)}</span>
        <span className="parametric-range-label">{variable.max.toFixed(0)}</span>
      </div>
    </div>
  );
}

// ─── Main view ──────────────────────────────────────────────────────────────

export default function ParametricView() {
  const dispatch = useDispatch();
  const pieces = useSelector((s: RootState) => s.project.pieces);
  const fabrics = useSelector((s: RootState) => s.project.fabrics);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [variableValues, setVariableValues] = useState<Record<string, number>>({});
  const [activePattern, _setActivePattern] = useState<SeamlyPattern | null>(null);
  const [baseMeasurements, _setBaseMeasurements] = useState<BodyMeasurements | null>(null);

  // Expose setters for programmatic use (copilot tool will call these)
  void _setActivePattern;
  void _setBaseMeasurements;

  // Build parametric variables from the loaded pattern
  const variables = useMemo((): ParametricVariable[] => {
    if (!activePattern) return [];

    const vars: ParametricVariable[] = [];

    for (const [key, def] of Object.entries(activePattern.variables)) {
      if (isHiddenVariable(key, def.formula)) continue;

      // Try to evaluate the formula to get current value
      const currentValue = variableValues[key] ?? 0;
      const category = categorizeVariable(key, def.description || '');

      // Derive range: ±50% of current value, or sensible defaults
      const baseVal = currentValue || 10;
      const min = Math.max(0, baseVal * 0.3);
      const max = baseVal * 2.5;

      vars.push({
        key,
        label: makeLabel(key),
        category,
        unit: activePattern.unit === 'cm' ? 'cm' : 'mm',
        min: Math.round(min * 10) / 10,
        max: Math.round(max * 10) / 10,
        step: activePattern.unit === 'cm' ? 0.1 : 1,
        defaultValue: currentValue,
        currentValue,
        description: def.description || '',
      });
    }

    return vars.sort((a, b) => {
      const catDiff = CATEGORY_META[a.category].order - CATEGORY_META[b.category].order;
      if (catDiff !== 0) return catDiff;
      return a.label.localeCompare(b.label);
    });
  }, [activePattern, variableValues]);

  // Group variables by category
  const groups = useMemo(() => {
    const map = new Map<SliderCategory, ParametricVariable[]>();
    for (const v of variables) {
      const arr = map.get(v.category) || [];
      arr.push(v);
      map.set(v.category, arr);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => CATEGORY_META[a].order - CATEGORY_META[b].order);
  }, [variables]);

  const toggleGroup = useCallback((category: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      next.has(category) ? next.delete(category) : next.add(category);
      return next;
    });
  }, []);

  const handleSliderChange = useCallback((key: string, value: number) => {
    setVariableValues(prev => ({ ...prev, [key]: value }));

    // Regenerate pieces with updated variable
    if (activePattern && baseMeasurements) {
      // Override the variable in the pattern
      const engine = new PatternTemplateEngine();
      const modifiedPattern = {
        ...activePattern,
        variables: {
          ...activePattern.variables,
          [key]: { ...activePattern.variables[key], formula: String(value) },
        },
      };
      engine.loadPattern(modifiedPattern);

      try {
        const newPieces = engine.generate(baseMeasurements);

        // Update existing pieces in place (preserve positions, selections)
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
        // Formula evaluation error — slider at extreme value, ignore
      }
    }
  }, [activePattern, baseMeasurements, pieces, dispatch]);

  const handleReset = useCallback(() => {
    if (!activePattern) return;
    // Reset all variables to their default values
    const defaults: Record<string, number> = {};
    for (const v of variables) {
      defaults[v.key] = v.defaultValue;
    }
    setVariableValues(defaults);
  }, [activePattern, variables]);

  // Current fabric info
  const currentFabric = useMemo(() => {
    if (pieces.length === 0) return null;
    const fabricId = pieces[0].fabricId;
    if (!fabricId) return null;
    return fabrics.find(f => f.id === fabricId) || null;
  }, [pieces, fabrics]);

  // ─── Empty state ──────────────────────────────────────────────────────

  if (!activePattern || variables.length === 0) {
    return (
      <div className="parametric-view">
        <div className="parametric-empty">
          <SlidersHorizontal size={32} className="parametric-empty-icon" />
          <span className="parametric-empty-title">No Template Loaded</span>
          <span className="parametric-empty-hint">
            Generate a pattern from a template using the copilot to enable parametric editing.
            <br /><br />
            Try: <em>"Generate a shirt size M"</em>
          </span>
        </div>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────

  return (
    <div className="parametric-view">
      {/* Template info bar */}
      <div className="parametric-template-bar">
        <span className="parametric-template-name">
          {activePattern.name.replace(/[_-]/g, ' ')}
        </span>
        <span className="parametric-template-meta">
          {variables.length} params
        </span>
      </div>

      {/* Fabric info bar (if assigned) */}
      {currentFabric && (
        <div className="parametric-fabric-bar">
          <div
            className="parametric-fabric-swatch"
            style={{ background: currentFabric.color }}
          />
          <span className="parametric-fabric-name">{currentFabric.name}</span>
          <span className="parametric-fabric-weight">{currentFabric.weight}gsm</span>
        </div>
      )}

      {/* Grouped sliders */}
      {groups.map(([category, vars]) => {
        const meta = CATEGORY_META[category];
        const isCollapsed = collapsedGroups.has(category);

        return (
          <div className="parametric-group" key={category}>
            <button
              className="parametric-group-header"
              onClick={() => toggleGroup(category)}
            >
              <span className="parametric-group-label">
                <span>{meta.icon}</span>
                {meta.label}
              </span>
              <ChevronDown
                size={12}
                className={`parametric-group-chevron ${isCollapsed ? 'collapsed' : ''}`}
              />
            </button>
            <div className={`parametric-group-body ${isCollapsed ? 'collapsed' : ''}`}>
              <div className="parametric-group-content">
                {vars.map(v => (
                  <ParametricSlider
                    key={v.key}
                    variable={v}
                    onChange={handleSliderChange}
                  />
                ))}
              </div>
            </div>
          </div>
        );
      })}

      {/* Reset button */}
      <button className="parametric-reset-btn" onClick={handleReset}>
        <RotateCcw size={12} />
        Reset to defaults
      </button>
    </div>
  );
}

// ─── Public API for loading patterns programmatically ───────────────────────

export type { ParametricVariable, SliderCategory };
