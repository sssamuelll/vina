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

import { useState, useCallback, useRef } from 'react';
import { useSelector } from 'react-redux';
import { ChevronDown, SlidersHorizontal, RotateCcw, X } from 'lucide-react';
import type { RootState } from '../../store';
import { useParametricEngine, type ParametricVariable, type SliderCategory } from '../../hooks/useParametricEngine';
import './ParametricView.css';

// ─── Category metadata ──────────────────────────────────────────────────────

const CATEGORY_META: Record<SliderCategory, { label: string; icon: string }> = {
  fit:          { label: 'FIT',          icon: '◎' },
  length:       { label: 'LENGTH',       icon: '↕' },
  proportions:  { label: 'PROPORTIONS',  icon: '⊞' },
  ease:         { label: 'EASE',         icon: '↔' },
  construction: { label: 'CONSTRUCTION', icon: '⚙' },
};

// ─── Slider component ───────────────────────────────────────────────────────

interface SliderProps {
  variable: ParametricVariable;
  onChange: (key: string, value: number) => void;
  onReset: (key: string) => void;
}

function ParametricSlider({ variable, onChange, onReset }: SliderProps) {
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
    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
    if (e.key === 'Escape') setIsEditing(false);
  };

  const fillPct = ((variable.currentValue - variable.min) / (variable.max - variable.min)) * 100;
  const trackStyle = {
    background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${fillPct}%, var(--border) ${fillPct}%, var(--border) 100%)`,
  };

  return (
    <div className={`parametric-slider ${variable.isOverridden ? 'parametric-slider--modified' : ''}`}>
      <div className="parametric-slider-header">
        <span className="parametric-slider-name">{variable.label}</span>
        <div className="parametric-slider-value">
          {variable.isOverridden && (
            <button
              className="parametric-slider-reset"
              onClick={() => onReset(variable.key)}
              title="Reset to default"
            >
              <X size={10} />
            </button>
          )}
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
  const fabrics = useSelector((s: RootState) => s.project.fabrics);
  const pieces = useSelector((s: RootState) => s.project.pieces);
  const { isActive, patternName, variables, groups, handleSliderChange, handleReset, handleResetVariable } = useParametricEngine();
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const toggleGroup = useCallback((category: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      next.has(category) ? next.delete(category) : next.add(category);
      return next;
    });
  }, []);

  // Count overridden variables
  const overriddenCount = variables.filter(v => v.isOverridden).length;

  // Current fabric info
  const currentFabric = pieces.length > 0 && pieces[0].fabricId
    ? fabrics.find(f => f.id === pieces[0].fabricId) || null
    : null;

  // ─── Empty state ──────────────────────────────────────────────────────

  if (!isActive || variables.length === 0) {
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
          {(patternName || '').replace(/[_-]/g, ' ')}
        </span>
        <span className="parametric-template-meta">
          {variables.length} params{overriddenCount > 0 ? ` · ${overriddenCount} modified` : ''}
        </span>
      </div>

      {/* Fabric info bar */}
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
                <span className="parametric-group-count">{vars.length}</span>
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
                    onReset={handleResetVariable}
                  />
                ))}
              </div>
            </div>
          </div>
        );
      })}

      {/* Reset button */}
      {overriddenCount > 0 && (
        <button className="parametric-reset-btn" onClick={handleReset}>
          <RotateCcw size={12} />
          Reset all to defaults
        </button>
      )}
    </div>
  );
}
