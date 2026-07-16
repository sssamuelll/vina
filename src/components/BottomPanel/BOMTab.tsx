/**
 * BOMTab — Bottom-panel tab showing the Bill of Materials in a grouped table.
 *
 * Features:
 * - Refresh BOM from project state (with stale badge)
 * - Add manual entries
 * - Currency selector (USD/EUR/GBP/CNY/JPY/KRW)
 * - Colorway tabs when project has >1 colorway
 * - Collapsible category groups
 * - Inline editing for name, description, quantity, unitCost
 * - Lock icon for auto-populated rows, delete button for manual rows
 * - Grand total footer
 * - Empty state when no entries
 */

import { useState, useCallback, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../../store';
import type { BOMCategory, BOMEntry } from '../../types/bom';
import {
  populateBOM,
  addManualEntry,
  updateEntry,
  removeEntry,
  setCurrency,
  selectBOMEntries,
  selectBOMIsStale,
  selectBOMForColorway,
} from '../../store/bomSlice';
import { extractAll } from '../../utils/export/bomExtractor';
import './BOMTab.css';

// ─── Constants ──────────────────────────────────────────────────────────────

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CNY', 'JPY', 'KRW'] as const;

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '\u20ac',
  GBP: '\u00a3',
  CNY: '\u00a5',
  JPY: '\u00a5',
  KRW: '\u20a9',
};

const CATEGORY_ORDER: BOMCategory[] = [
  'fabric',
  'interfacing',
  'thread',
  'seam-tape',
  'elastic',
  'trim',
  'label',
  'other',
];

const CATEGORY_LABELS: Record<BOMCategory, string> = {
  fabric: 'Telas',
  interfacing: 'Entretela',
  thread: 'Hilo',
  'seam-tape': 'Cinta de costura',
  elastic: 'Elásticos',
  trim: 'Avíos',
  label: 'Etiquetas',
  other: 'Otros',
};

// Display-only: los valores de BOMUnit son claves tipadas (extractores, tools, tests) — no se traducen.
const UNIT_LABELS: Record<string, string> = {
  meters: 'm',
  yards: 'yd',
  cm: 'cm',
  pieces: 'uds',
  rolls: 'rollos',
};

// ─── Component ──────────────────────────────────────────────────────────────

export default function BOMTab() {
  const dispatch = useDispatch();

  // Redux state
  const entries = useSelector(selectBOMEntries);
  const isStale = useSelector(selectBOMIsStale);
  const currency = useSelector((s: RootState) => s.bom.currency);
  const colorways = useSelector((s: RootState) => s.project.colorways ?? []);
  const pieces = useSelector((s: RootState) => s.project.pieces);
  const fabrics = useSelector((s: RootState) => s.project.fabrics ?? []);
  const seams = useSelector((s: RootState) => s.project.seams);
  const elastics = useSelector((s: RootState) => s.project.elastics ?? []);
  const trims = useSelector((s: RootState) => s.project.trims ?? []);
  const projectUpdatedAt = useSelector((s: RootState) => ((s.project as unknown as Record<string, unknown>).updatedAt as number) ?? 0);

  // Local state
  const [collapsedCategories, setCollapsedCategories] = useState<Set<BOMCategory>>(new Set());
  const [activeColorwayId, setActiveColorwayId] = useState<string | null>(null);

  // Resolved entries for active colorway
  const resolvedEntries = useSelector((s: RootState) =>
    activeColorwayId ? selectBOMForColorway(s, activeColorwayId) : null
  );

  // Display entries: resolved if a colorway is selected, otherwise plain entries
  const displayEntries = useMemo(() => {
    if (resolvedEntries) return resolvedEntries;
    return entries.map(e => ({
      ...e,
      resolvedName: e.name,
      resolvedUnitCost: e.unitCost,
      totalCost: e.quantity * e.unitCost,
    }));
  }, [entries, resolvedEntries]);

  // Group entries by category
  const grouped = useMemo(() => {
    const map = new Map<BOMCategory, typeof displayEntries>();
    for (const entry of displayEntries) {
      const list = map.get(entry.category) || [];
      list.push(entry);
      map.set(entry.category, list);
    }
    return map;
  }, [displayEntries]);

  // Grand total (accounts for colorway overrides if active)
  const grandTotal = useMemo(() => {
    return displayEntries.reduce((sum, e) => sum + e.totalCost, 0);
  }, [displayEntries]);

  const currencySymbol = CURRENCY_SYMBOLS[currency] || currency;

  // ─── Handlers ───────────────────────────────────────────────────────────

  const handleRefresh = useCallback(() => {
    const extracted = extractAll(pieces, fabrics, seams, elastics, trims);
    dispatch(populateBOM({ entries: extracted, projectVersion: projectUpdatedAt }));
  }, [dispatch, pieces, fabrics, seams, elastics, trims, projectUpdatedAt]);

  const handleAddItem = useCallback(() => {
    dispatch(addManualEntry({
      category: 'other',
      name: 'Nuevo ítem',
      description: '',
      quantity: 1,
      unit: 'pieces',
      unitCost: 0,
      currency,
      colorwayOverrides: {},
      sourcePieceIds: [],
    }));
  }, [dispatch, currency]);

  const handleCurrencyChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    dispatch(setCurrency(e.target.value));
  }, [dispatch]);

  const handleToggleCategory = useCallback((cat: BOMCategory) => {
    setCollapsedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }, []);

  const handleUpdateField = useCallback((id: string, field: keyof BOMEntry, value: string | number) => {
    dispatch(updateEntry({ id, changes: { [field]: value } }));
  }, [dispatch]);

  const handleRemove = useCallback((id: string) => {
    dispatch(removeEntry(id));
  }, [dispatch]);

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="bom-tab">
      {/* Toolbar */}
      <div className="bom-toolbar">
        <button onClick={handleRefresh}>
          Actualizar BOM
          {/* Punto, no jerga: "(stale)" era vocabulario de cache (Fase 2). */}
          {isStale && <span className="bom-stale-badge" title="El patrón cambió desde la última actualización"> •</span>}
        </button>
        <button onClick={handleAddItem}>+ Añadir ítem</button>
        <select value={currency} onChange={handleCurrencyChange}>
          {CURRENCIES.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        {/* Sin entradas no hay total que mostrar — "$0.00" leia como bug (Fase 2). */}
        {displayEntries.length > 0 && (
          <span className="bom-total">
            Total: {currencySymbol}{grandTotal.toFixed(2)}
          </span>
        )}
      </div>

      {/* Colorway tabs */}
      {colorways.length > 1 && (
        <div className="bom-colorway-tabs">
          <button
            className={`bom-colorway-tab ${activeColorwayId === null ? 'active' : ''}`}
            onClick={() => setActiveColorwayId(null)}
          >
            Base
          </button>
          {colorways.map(cw => (
            <button
              key={cw.id}
              className={`bom-colorway-tab ${activeColorwayId === cw.id ? 'active' : ''}`}
              onClick={() => setActiveColorwayId(cw.id)}
            >
              {cw.name}
            </button>
          ))}
        </div>
      )}

      {/* Table or empty state */}
      {entries.length === 0 ? (
        <div className="bom-empty">
          La lista de materiales (BOM) reúne los insumos del proyecto —telas, avíos, hilo— con cantidades y costos.
          &quot;Actualizar BOM&quot; la extrae de las piezas del proyecto; &quot;+ Añadir ítem&quot; agrega una entrada manual.
        </div>
      ) : (
        <div className="bom-table-container">
          <table className="bom-table">
            <thead>
              <tr>
                <th style={{ width: 24 }}></th>
                <th>Nombre</th>
                <th>Descripción</th>
                <th>Cant.</th>
                <th>Unidad</th>
                <th>Costo unitario</th>
                <th>Total</th>
                <th style={{ width: 30 }}></th>
              </tr>
            </thead>
            <tbody>
              {CATEGORY_ORDER.map(cat => {
                const catEntries = grouped.get(cat);
                if (!catEntries || catEntries.length === 0) return null;
                const collapsed = collapsedCategories.has(cat);
                return (
                  <CategoryGroup
                    key={cat}
                    category={cat}
                    entries={catEntries}
                    collapsed={collapsed}
                    currencySymbol={currencySymbol}
                    onToggle={handleToggleCategory}
                    onUpdate={handleUpdateField}
                    onRemove={handleRemove}
                  />
                );
              })}
              {/* Grand total row */}
              <tr>
                <td colSpan={6} className="bom-grand-total">Total general</td>
                <td className="bom-grand-total">{currencySymbol}{grandTotal.toFixed(2)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Category Group Sub-component ────────────────────────────────────────────

interface CategoryGroupProps {
  category: BOMCategory;
  entries: Array<{
    id: string;
    category: BOMCategory;
    name: string;
    description: string;
    quantity: number;
    unit: string;
    unitCost: number;
    autoPopulated: boolean;
    resolvedName: string;
    resolvedUnitCost: number;
    totalCost: number;
  }>;
  collapsed: boolean;
  currencySymbol: string;
  onToggle: (cat: BOMCategory) => void;
  onUpdate: (id: string, field: keyof BOMEntry, value: string | number) => void;
  onRemove: (id: string) => void;
}

function CategoryGroup({
  category,
  entries,
  collapsed,
  currencySymbol,
  onToggle,
  onUpdate,
  onRemove,
}: CategoryGroupProps) {
  const subtotal = entries.reduce((sum, e) => sum + e.totalCost, 0);

  return (
    <>
      <tr className="bom-category-header" onClick={() => onToggle(category)}>
        <td colSpan={6}>
          {collapsed ? '\u25b6' : '\u25bc'} {CATEGORY_LABELS[category]} ({entries.length})
        </td>
        <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
          {currencySymbol}{subtotal.toFixed(2)}
        </td>
        <td></td>
      </tr>
      {!collapsed && entries.map(entry => (
        <tr key={entry.id} className="bom-row">
          <td>
            {entry.autoPopulated && (
              <span className="bom-lock-icon" title="Extraído automáticamente del proyecto">
                &#x1f512;
              </span>
            )}
          </td>
          <td>
            <input
              type="text"
              value={entry.resolvedName}
              onChange={e => onUpdate(entry.id, 'name', e.target.value)}
              title={entry.resolvedName}
            />
          </td>
          <td>
            <input
              type="text"
              value={entry.description}
              onChange={e => onUpdate(entry.id, 'description', e.target.value)}
              title={entry.description}
            />
          </td>
          <td>
            <input
              type="number"
              value={entry.quantity}
              min={0}
              step={0.01}
              onChange={e => onUpdate(entry.id, 'quantity', parseFloat(e.target.value) || 0)}
            />
          </td>
          <td>{UNIT_LABELS[entry.unit] ?? entry.unit}</td>
          <td>
            <input
              type="number"
              value={entry.resolvedUnitCost}
              min={0}
              step={0.01}
              onChange={e => onUpdate(entry.id, 'unitCost', parseFloat(e.target.value) || 0)}
            />
          </td>
          <td style={{ fontVariantNumeric: 'tabular-nums' }}>
            {currencySymbol}{entry.totalCost.toFixed(2)}
          </td>
          <td>
            {!entry.autoPopulated && (
              <button
                className="bom-delete-btn"
                onClick={() => onRemove(entry.id)}
                title="Eliminar entrada"
              >
                &times;
              </button>
            )}
          </td>
        </tr>
      ))}
    </>
  );
}
