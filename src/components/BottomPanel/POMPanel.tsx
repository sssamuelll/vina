/**
 * POMPanel — Bottom-panel tab showing all Points of Measure in a table.
 *
 * Features:
 * - Sortable columns (name, category)
 * - Inline editing (name, tolerance)
 * - Category dropdown
 * - CSV export
 * - Click row to select POM in viewport
 * - Auto-recomputes values when pieces change
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../../store';
import type { PointOfMeasure, PatternPiece, POMCategory } from '../../types/types';
import { updatePOM, removePOM, recomputePOMValues } from '../../store/projectSlice';
import { selectPOM } from '../../store/editorSlice';
import { recomputeAllPOMs } from '../../utils/pom/pomCompute';
import './POMPanel.css';

// ─── Constants ──────────────────────────────────────────────────────────────

const POM_CATEGORIES: POMCategory[] = ['length', 'width', 'circumference', 'height', 'custom'];

type SortField = 'name' | 'category';
type SortDir = 'asc' | 'desc';

// ─── CSV Export ─────────────────────────────────────────────────────────────

/** Escape a string for CSV: quote if it contains special chars or formula prefixes. */
function csvEscape(val: string): string {
  if (/[,"\n\r]/.test(val) || /^[=+\-@]/.test(val)) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function exportCSV(poms: PointOfMeasure[], pieces: PatternPiece[]) {
  const fresh = recomputeAllPOMs(poms, pieces);
  const valueMap = new Map(fresh.map(u => [u.id, u.value]));
  const rows = poms.map(p => {
    const pieceA = pieces.find(pc => pc.id === p.pointA.pieceId)?.name ?? '?';
    const pieceB = pieces.find(pc => pc.id === p.pointB.pieceId)?.name ?? '?';
    const val = valueMap.get(p.id) ?? p.value;
    return `${csvEscape(p.name)},${csvEscape(p.category)},${p.method},${csvEscape(pieceA)},${csvEscape(pieceB)},${val.toFixed(1)},${p.tolerance ?? ''}`;
  });
  const csv = `Name,Category,Method,Piece A,Piece B,Value (mm),Tolerance (mm)\n${rows.join('\n')}`;
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'pom-measurements.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Inline Edit Cell ───────────────────────────────────────────────────────

function InlineTextCell({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(value);
      // Focus on next tick so the element is in the DOM
      requestAnimationFrame(() => inputRef.current?.select());
    }
  }, [editing, value]);

  const commit = useCallback(() => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) {
      onCommit(trimmed);
    }
  }, [draft, value, onCommit]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="pom-inline-input"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setEditing(false);
        }}
      />
    );
  }

  return (
    <span onDoubleClick={() => setEditing(true)} style={{ cursor: 'text' }}>
      {value}
    </span>
  );
}

function InlineNumberCell({
  value,
  onCommit,
}: {
  value: number | undefined;
  onCommit: (v: number | undefined) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value?.toString() ?? '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(value?.toString() ?? '');
      requestAnimationFrame(() => inputRef.current?.select());
    }
  }, [editing, value]);

  const commit = useCallback(() => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed === '') {
      if (value !== undefined) onCommit(undefined);
    } else {
      const num = parseFloat(trimmed);
      if (!isNaN(num) && num !== value) onCommit(num);
    }
  }, [draft, value, onCommit]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="pom-inline-input"
        type="number"
        step="0.1"
        min="0"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setEditing(false);
        }}
        style={{ width: 60 }}
      />
    );
  }

  return (
    <span
      className="pom-tolerance"
      onDoubleClick={() => setEditing(true)}
      style={{ cursor: 'text' }}
    >
      {value != null ? `\u00b1${value}` : '\u2014'}
    </span>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

export default function POMPanel() {
  const dispatch = useDispatch();

  const pieces = useSelector((s: RootState) => s.project.pieces);
  const poms = useSelector((s: RootState) => s.project.poms);
  const selectedPOMId = useSelector((s: RootState) => s.editor.selectedPOMId);

  // Recompute POM values when pieces change (use ref to avoid loop)
  const pomsRef = useRef(poms);
  pomsRef.current = poms;
  useEffect(() => {
    if (pomsRef.current.length === 0) return;
    const updates = recomputeAllPOMs(pomsRef.current, pieces);
    const changed = updates.filter(u => {
      const existing = pomsRef.current.find(p => p.id === u.id);
      return existing && Math.abs(existing.value - u.value) > 0.001;
    });
    if (changed.length > 0) dispatch(recomputePOMValues(changed));
  }, [pieces, dispatch]);

  // Sort state
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const toggleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  }, [sortField]);

  // Sorted POMs
  const sortedPoms = [...poms].sort((a, b) => {
    const va = a[sortField];
    const vb = b[sortField];
    const cmp = va.localeCompare(vb);
    return sortDir === 'asc' ? cmp : -cmp;
  });

  // Handlers
  const handleRowClick = useCallback(
    (id: string) => {
      dispatch(selectPOM(id));
    },
    [dispatch],
  );

  const handleNameChange = useCallback(
    (pom: PointOfMeasure, newName: string) => {
      dispatch(updatePOM({ ...pom, name: newName }));
    },
    [dispatch],
  );

  const handleCategoryChange = useCallback(
    (pom: PointOfMeasure, newCat: POMCategory) => {
      dispatch(updatePOM({ ...pom, category: newCat }));
    },
    [dispatch],
  );

  const handleToleranceChange = useCallback(
    (pom: PointOfMeasure, newTol: number | undefined) => {
      dispatch(updatePOM({ ...pom, tolerance: newTol }));
    },
    [dispatch],
  );

  const handleDelete = useCallback(
    (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      dispatch(removePOM(id));
    },
    [dispatch],
  );

  // ─── Empty state ────────────────────────────────────────────────────

  if (poms.length === 0) {
    return (
      <div className="pom-panel pom-panel-empty">
        <span>No measurements. Use the POM tool (P) to create one.</span>
      </div>
    );
  }

  // ─── Table ──────────────────────────────────────────────────────────

  const sortArrow = (field: SortField) =>
    sortField === field ? (
      <span className="pom-sort-arrow">{sortDir === 'asc' ? '\u25b2' : '\u25bc'}</span>
    ) : null;

  return (
    <div className="pom-panel">
      <div className="pom-panel-header">
        <span className="pom-panel-title">Points of Measure ({poms.length})</span>
        <button className="pom-panel-export" onClick={() => exportCSV(poms, pieces)}>
          Export CSV
        </button>
      </div>

      <table className="pom-table">
        <thead>
          <tr>
            <th onClick={() => toggleSort('name')}>
              Name{sortArrow('name')}
            </th>
            <th onClick={() => toggleSort('category')}>
              Category{sortArrow('category')}
            </th>
            <th>Method</th>
            <th>Value</th>
            <th>Tolerance</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {sortedPoms.map(pom => (
            <tr
              key={pom.id}
              className={`pom-row ${pom.id === selectedPOMId ? 'pom-row--selected' : ''}`}
              onClick={() => handleRowClick(pom.id)}
            >
              <td>
                <InlineTextCell
                  value={pom.name}
                  onCommit={v => handleNameChange(pom, v)}
                />
              </td>
              <td>
                <select
                  className="pom-category-select"
                  value={pom.category}
                  onChange={e => {
                    e.stopPropagation();
                    handleCategoryChange(pom, e.target.value as POMCategory);
                  }}
                  onClick={e => e.stopPropagation()}
                >
                  {POM_CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </td>
              <td>{pom.method}</td>
              <td className="pom-value">{pom.value.toFixed(1)}mm</td>
              <td>
                <InlineNumberCell
                  value={pom.tolerance}
                  onCommit={v => handleToleranceChange(pom, v)}
                />
              </td>
              <td>
                <button
                  className="pom-delete-btn"
                  title="Delete POM"
                  onClick={e => handleDelete(pom.id, e)}
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
