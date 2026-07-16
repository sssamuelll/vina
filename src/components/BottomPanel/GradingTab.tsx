/**
 * GradingTab — Size grading configuration and execution UI.
 *
 * Displays a size table with measurement columns, lets the user pick a
 * size system and base size, toggle active sizes, set production quantities,
 * and run the grading engine to generate scaled pattern-piece variants.
 *
 * @module GradingTab
 */

import { useCallback, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../../store';
import {
  setEnabled,
  setSizeSystem,
  setBaseSize,
  setActiveSizes,
  setQuantity,
  setGradingResult,
  clearGrading,
  setStale,
} from '../../store/gradingSlice';
import type { GradingState } from '../../store/gradingSlice';
import { addPiece, removePieces, renameLayer } from '../../store/projectSlice';
import { gradePieceToSize } from '../../utils/grading/gradingEngine';
import { summarizeGradingProvenance } from '../../utils/grading/provenance';
import { batchUndo } from '../../store/undoMiddleware';
import {
  getSizeSystems,
  getAvailableSizes,
  getSizeMeasurements,
} from '../../utils/seamly2d/sizeTables';
import type { SizeSystem, StandardSize } from '../../utils/seamly2d/sizeTables';
import { newId } from '../../utils/ids';
import './GradingTab.css';

// ─── Constants ──────────────────────────────────────────────────────────────

const GRADING_LAYER = 10;

/** Measurement keys we display as columns (in mm internally, shown as cm). */
const DISPLAY_MEASUREMENTS = ['chest', 'waist', 'hips'] as const;

/** UI labels for measurement columns (keys stay English — they index measurement data). */
const MEASUREMENT_LABELS: Record<(typeof DISPLAY_MEASUREMENTS)[number], string> = {
  chest: 'Pecho',
  waist: 'Cintura',
  hips: 'Cadera',
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function mmToCm(mm: number): string {
  return (mm / 10).toFixed(1);
}

// B11-state: thin wrapper around the canonical newId(). Verified
// non-load-bearing.
function generateId(): string {
  return newId();
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function GradingTab() {
  const dispatch = useDispatch<AppDispatch>();
  const grading = useSelector((s: RootState) => s.grading);
  const pieces = useSelector((s: RootState) => s.project.pieces);

  const {
    sizeSystem,
    baseSize,
    activeSizes,
    quantities,
    generatedPieces,
    stale,
    lastGradedAt,
  } = grading;

  // ── Derived data ────────────────────────────────────────────────────────

  const sizeSystems = useMemo(() => getSizeSystems(), []);

  /** Only EU systems are currently supported by sizeTables. */
  const isSupportedSystem = (sys: string): sys is SizeSystem =>
    sys === 'eu-women' || sys === 'eu-men' || sys === 'eu-children';

  const availableSizes = useMemo<string[]>(() => {
    if (!isSupportedSystem(sizeSystem)) return [];
    return getAvailableSizes(sizeSystem);
  }, [sizeSystem]);

  /** Measurements for each size (keyed by size label). */
  const sizeMeasurements = useMemo(() => {
    const map: Record<string, Partial<Record<string, number>>> = {};
    if (!isSupportedSystem(sizeSystem)) return map;
    for (const sz of availableSizes) {
      const m = getSizeMeasurements(sz as StandardSize, sizeSystem);
      if (m) map[sz] = m as Record<string, number>;
    }
    return map;
  }, [sizeSystem, availableSizes]);

  /** Base pieces — those without a gradedSize tag. */
  const basePieces = useMemo(
    () => pieces.filter((p) => !p.gradedSize),
    [pieces],
  );

  /**
   * How these pieces actually grade — per-point (real) vs uniform (proportional).
   * Drives the honest label so a proportional scale is never passed off as a
   * true size run (Step 4, Level-1 imported-grading scope).
   */
  const provenance = useMemo(
    () => summarizeGradingProvenance(basePieces),
    [basePieces],
  );

  /** All generated piece IDs across all sizes, flattened. */
  const allGeneratedIds = useMemo(() => {
    const ids: string[] = [];
    for (const arr of Object.values(generatedPieces)) {
      ids.push(...arr);
    }
    return ids;
  }, [generatedPieces]);

  const hasGenerated = allGeneratedIds.length > 0;

  // ── Totals ──────────────────────────────────────────────────────────────

  const totalUnits = useMemo(() => {
    let sum = 0;
    for (const sz of activeSizes) {
      sum += quantities[sz] ?? 1;
    }
    return sum;
  }, [activeSizes, quantities]);

  // ── Handlers ────────────────────────────────────────────────────────────

  const handleSystemChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      dispatch(setSizeSystem(e.target.value as GradingState['sizeSystem']));
    },
    [dispatch],
  );

  const handleBaseSizeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      dispatch(setBaseSize(e.target.value));
      if (hasGenerated) dispatch(setStale(true));
    },
    [dispatch, hasGenerated],
  );

  const handleToggleSize = useCallback(
    (size: string) => {
      const next = activeSizes.includes(size)
        ? activeSizes.filter((s) => s !== size)
        : [...activeSizes, size];
      dispatch(setActiveSizes(next));
      if (hasGenerated) dispatch(setStale(true));
    },
    [dispatch, activeSizes, hasGenerated],
  );

  const handleQuantityChange = useCallback(
    (size: string, value: number) => {
      dispatch(setQuantity({ size, quantity: Math.max(0, value) }));
    },
    [dispatch],
  );

  // ── Grade execution ─────────────────────────────────────────────────────

  const removeGenerated = useCallback(() => {
    if (allGeneratedIds.length > 0) {
      dispatch(removePieces(allGeneratedIds));
    }
  }, [dispatch, allGeneratedIds]);

  const runGrading = useCallback(() => {
    if (!isSupportedSystem(sizeSystem)) return;
    if (basePieces.length === 0) return;

    const baseMeas = sizeMeasurements[baseSize];
    if (!baseMeas) return;

    batchUndo(dispatch, 'Escalar patrón', () => {
      // Remove any prior generated pieces
      removeGenerated();

      // Convert mm to cm for gradePiece (it expects cm)
      const baseCm: Record<string, number> = {};
      for (const [k, v] of Object.entries(baseMeas)) {
        baseCm[k] = (v as number) / 10;
      }

      const generated: Record<string, string[]> = {};
      const sizesToGrade = activeSizes.filter((s) => s !== baseSize);

      for (const size of sizesToGrade) {
        const targetMeas = sizeMeasurements[size];
        if (!targetMeas) continue;

        const targetCm: Record<string, number> = {};
        for (const [k, v] of Object.entries(targetMeas)) {
          targetCm[k] = (v as number) / 10;
        }

        const pieceIds: string[] = [];
        for (const piece of basePieces) {
          // Per-point grade rules (Level 1, #847 choice A) when the piece carries
          // them; uniform scaling otherwise — routed by gradePieceToSize.
          const scaled = gradePieceToSize(piece, baseCm, targetCm, 'chest');
          const newId = generateId();
          const gradedPiece = {
            ...scaled,
            id: newId,
            name: `${piece.name} [${size}]`,
            locked: true,
            layer: GRADING_LAYER,
            gradedSize: size,
            // Derived variants don't carry the base's grade rules — their
            // anchors reference the pre-grade outline (stale, dead metadata).
            gradeRules: undefined,
          };
          dispatch(addPiece(gradedPiece));
          pieceIds.push(newId);
        }
        generated[size] = pieceIds;
      }

      // Ensure layer name is set
      dispatch(renameLayer({ layer: GRADING_LAYER, name: 'Escalado' }));
      dispatch(setGradingResult({ generatedPieces: generated }));
      dispatch(setEnabled(true));
    });
  }, [
    dispatch,
    sizeSystem,
    baseSize,
    activeSizes,
    basePieces,
    sizeMeasurements,
    removeGenerated,
  ]);

  const handleGrade = useCallback(() => {
    runGrading();
  }, [runGrading]);

  const handleRegrade = useCallback(() => {
    runGrading();
  }, [runGrading]);

  const handleClear = useCallback(() => {
    batchUndo(dispatch, 'Limpiar escalado', () => {
      removeGenerated();
      dispatch(clearGrading());
    });
  }, [dispatch, removeGenerated]);

  // ── Render ──────────────────────────────────────────────────────────────

  if (availableSizes.length === 0) {
    return (
      <div className="grading-tab">
        <div className="grading-toolbar">
          <label>
            Sistema:
            <select value={sizeSystem} onChange={handleSystemChange} style={{ marginLeft: 4 }}>
              {sizeSystems.map((s) => (
                <option key={s.system} value={s.system}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="grading-empty">
          <span>Selecciona un sistema de tallas y pulsa Escalar para generar las variantes de talla.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="grading-tab">
      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="grading-toolbar">
        <button onClick={handleGrade} disabled={activeSizes.length === 0 || basePieces.length === 0}>
          Escalar
        </button>
        {hasGenerated && (
          <button onClick={handleRegrade}>
            Reescalar
            {stale && <span className="grading-stale-badge"> (desactualizado)</span>}
          </button>
        )}
        {hasGenerated && (
          <button onClick={handleClear}>Limpiar escalado</button>
        )}
        <label>
          Sistema:
          <select value={sizeSystem} onChange={handleSystemChange} style={{ marginLeft: 4 }}>
            {sizeSystems.map((s) => (
              <option key={s.system} value={s.system}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Base:
          <select value={baseSize} onChange={handleBaseSizeChange} style={{ marginLeft: 4 }}>
            {availableSizes.map((sz) => (
              <option key={sz} value={sz}>
                {sz}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* ── Honest provenance ───────────────────────────────────────────── */}
      {basePieces.length > 0 && (
        <div className="grading-provenance">
          {provenance.method === 'uniform' ? (
            <span>
              Escalado proporcional: todas las medidas crecen a la par. Este
              patrón no trae reglas de escalado por punto.
            </span>
          ) : (
            <span>
              Escalado por punto
              {provenance.method === 'mixed' ? ' (mixto con proporcional)' : ''}.
            </span>
          )}
          {provenance.frozenInternalsPieces > 0 && (
            <span className="grading-provenance-warn">
              {provenance.frozenInternalsPieces}{' '}
              {provenance.frozenInternalsPieces === 1 ? 'pieza' : 'piezas'} con
              pinzas o piquetes: en escalado por punto los internos se mantienen
              sin escalar todavía.
            </span>
          )}
        </div>
      )}

      {/* ── Size Table ──────────────────────────────────────────────────── */}
      <div className="grading-table-container">
        <table className="grading-table">
          <thead>
            <tr>
              <th>Activa</th>
              <th>Talla</th>
              {DISPLAY_MEASUREMENTS.map((m) => (
                <th key={m}>{MEASUREMENT_LABELS[m]} (cm)</th>
              ))}
              <th>Cant</th>
            </tr>
          </thead>
          <tbody>
            {availableSizes.map((sz) => {
              const isBase = sz === baseSize;
              const isActive = activeSizes.includes(sz);
              const meas = sizeMeasurements[sz] ?? {};

              return (
                <tr key={sz} className={isBase ? 'grading-base-row' : undefined}>
                  <td>
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={() => handleToggleSize(sz)}
                    />
                  </td>
                  <td>
                    {isBase ? '\u2605 ' : ''}
                    {sz}
                  </td>
                  {DISPLAY_MEASUREMENTS.map((m) => (
                    <td key={m}>
                      {meas[m] != null ? mmToCm(meas[m] as number) : '\u2014'}
                    </td>
                  ))}
                  <td>
                    <input
                      type="number"
                      min={0}
                      value={quantities[sz] ?? 1}
                      onChange={(e) =>
                        handleQuantityChange(sz, parseInt(e.target.value, 10) || 0)
                      }
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Stats Footer ────────────────────────────────────────────────── */}
      <div className="grading-stats">
        <span>Tallas activas: {activeSizes.length}</span>
        <span>Unidades: {totalUnits}</span>
        {lastGradedAt && (
          <span>Último escalado: {new Date(lastGradedAt).toLocaleTimeString()}</span>
        )}
      </div>
    </div>
  );
}
