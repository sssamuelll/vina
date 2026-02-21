import { useState, useMemo, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../../store';
import { updatePiece } from '../../store/projectSlice';
import { standardGradeTable, gradePiece } from '../../utils/grading';
import type { GradeTable } from '../../utils/grading';
import type { PathCommand } from '../../types/types';
import './views.css';

// ─── Constants ───

const ALL_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'] as const;
type SizeLabel = (typeof ALL_SIZES)[number];

const GRADE_TABLE: GradeTable = standardGradeTable();
const MEASUREMENT_KEYS = ['chest', 'waist', 'hips'] as const;

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

// ─── SVG Preview Helpers ───

function outlineToSvgPath(outline: PathCommand[]): string {
  return outline
    .map(cmd => {
      if (cmd.type === 'Z') return 'Z';
      return `${cmd.type} ${cmd.values.join(' ')}`;
    })
    .join(' ');
}

// ─── Main Component ───

export default function GradingView() {
  const dispatch = useDispatch();
  const pieces = useSelector((s: RootState) => s.project.pieces);
  const selectedPieceIds = useSelector((s: RootState) => s.editor.selectedPieceIds);
  const measurements = useSelector((s: RootState) => s.project.avatar.measurements);
  void measurements; // reserved for future use

  const [baseSize, setBaseSize] = useState<SizeLabel>('M');
  const [targetSizes, setTargetSizes] = useState<Set<SizeLabel>>(new Set(['S', 'M', 'L']));
  const [method, setMethod] = useState<'rule-based' | 'proportional'>('rule-based');

  const selectedPiece = pieces.find(p => selectedPieceIds.includes(p.id));

  const toggleTargetSize = useCallback((size: SizeLabel) => {
    setTargetSizes(prev => {
      const next = new Set(prev);
      if (next.has(size)) {
        next.delete(size);
      } else {
        next.add(size);
      }
      return next;
    });
  }, []);

  // Compute graded outlines for preview
  const gradedOutlines = useMemo(() => {
    if (!selectedPiece) return [];

    const baseMeasurements = GRADE_TABLE.sizes[baseSize] ?? {};
    const outlines: { size: SizeLabel; path: string; color: string }[] = [];

    const colors: Record<string, string> = {
      XS: '#e06c75', S: '#e5c07b', M: '#98c379',
      L: '#61afef', XL: '#c678dd', XXL: '#56b6c2',
    };

    for (const size of ALL_SIZES) {
      if (!targetSizes.has(size)) continue;

      if (size === baseSize) {
        outlines.push({
          size,
          path: outlineToSvgPath(selectedPiece.outline),
          color: colors[size],
        });
      } else {
        const targetMeasurements = GRADE_TABLE.sizes[size] ?? {};
        const graded = gradePiece(
          selectedPiece,
          baseMeasurements as Record<string, number>,
          targetMeasurements as Record<string, number>,
        );
        outlines.push({
          size,
          path: outlineToSvgPath(graded.outline),
          color: colors[size],
        });
      }
    }

    return outlines;
  }, [selectedPiece, baseSize, targetSizes]);

  const handleApplyGrading = useCallback(() => {
    if (!selectedPiece) return;

    const baseMeasurements = GRADE_TABLE.sizes[baseSize] ?? {};

    for (const size of targetSizes) {
      if (size === baseSize) continue;
      const targetMeasurements = GRADE_TABLE.sizes[size] ?? {};
      const graded = gradePiece(
        selectedPiece,
        baseMeasurements as Record<string, number>,
        targetMeasurements as Record<string, number>,
      );
      // Dispatch graded piece as a new piece variant
      dispatch(
        updatePiece({
          ...graded,
          id: `${selectedPiece.id}-${size}`,
          name: `${selectedPiece.name} (${size})`,
          updatedAt: Date.now(),
        }),
      );
    }
  }, [dispatch, selectedPiece, baseSize, targetSizes]);

  return (
    <div className="sidebar-view">
      <div className="sidebar-view-header">
        <div className="sidebar-view-header-actions">
          <button
            onClick={handleApplyGrading}
            title="Apply Grading"
            style={{ width: 'auto', padding: '0 6px', fontSize: 11 }}
            disabled={!selectedPiece}
          >
            ▶ Apply
          </button>
        </div>
      </div>
      <div className="sidebar-view-content">
        {!selectedPiece && (
          <div className="sidebar-section">
            <div className="sidebar-section-body" style={{ paddingTop: 8 }}>
              <div className="sidebar-info">Select a piece to grade.</div>
            </div>
          </div>
        )}

        {/* Base Size */}
        <Section title="Base Size">
          <select
            className="sidebar-select"
            value={baseSize}
            onChange={(e) => setBaseSize(e.target.value as SizeLabel)}
          >
            {ALL_SIZES.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Section>

        {/* Target Sizes */}
        <Section title="Target Sizes">
          <div className="sidebar-toggle-group">
            {ALL_SIZES.map(s => (
              <button
                key={s}
                className={`sidebar-toggle-btn${targetSizes.has(s) ? ' active' : ''}`}
                onClick={() => toggleTargetSize(s)}
              >
                {s}
              </button>
            ))}
          </div>
        </Section>

        {/* Method */}
        <Section title="Method">
          <div className="sidebar-radio-group">
            <label className="sidebar-radio-label">
              <input
                type="radio"
                name="grading-method"
                checked={method === 'rule-based'}
                onChange={() => setMethod('rule-based')}
              />
              Rule-based
            </label>
            <label className="sidebar-radio-label">
              <input
                type="radio"
                name="grading-method"
                checked={method === 'proportional'}
                onChange={() => setMethod('proportional')}
              />
              Proportional
            </label>
          </div>
        </Section>

        {/* Grade Rules */}
        <Section title="Grade Rules" defaultOpen={false}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', color: '#888', padding: '2px 4px', fontWeight: 500 }}></th>
                  {ALL_SIZES.map(s => (
                    <th key={s} style={{ textAlign: 'center', color: '#888', padding: '2px 4px', fontWeight: 500 }}>
                      {s}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MEASUREMENT_KEYS.map(mKey => {
                  const mLabel = mKey.charAt(0).toUpperCase() + mKey.slice(1);
                  const baseVal = (GRADE_TABLE.sizes[baseSize]?.[mKey]) ?? 0;
                  return (
                    <tr key={mKey}>
                      <td style={{ color: '#aaa', padding: '2px 4px' }}>{mLabel} Δ</td>
                      {ALL_SIZES.map(s => {
                        const val = (GRADE_TABLE.sizes[s]?.[mKey]) ?? 0;
                        const delta = val - baseVal;
                        const sign = delta > 0 ? '+' : '';
                        return (
                          <td
                            key={s}
                            style={{
                              textAlign: 'center',
                              padding: '2px 4px',
                              color: delta === 0 ? '#666' : '#cccccc',
                            }}
                          >
                            {sign}{delta}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>

        {/* SVG Preview */}
        {selectedPiece && gradedOutlines.length > 0 && (
          <Section title="Preview">
            <div className="sidebar-svg-preview" style={{ height: 160 }}>
              <svg
                width="100%"
                height="100%"
                viewBox="-20 -20 240 240"
                preserveAspectRatio="xMidYMid meet"
              >
                {gradedOutlines.map(({ size, path, color }) => (
                  <path
                    key={size}
                    d={path}
                    fill="none"
                    stroke={color}
                    strokeWidth={size === baseSize ? 1.5 : 0.8}
                    strokeDasharray={size === baseSize ? 'none' : '4 2'}
                    opacity={0.8}
                  />
                ))}
              </svg>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
              {gradedOutlines.map(({ size, color }) => (
                <span key={size} style={{ fontSize: 10, color }}>
                  ■ {size}
                </span>
              ))}
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}
