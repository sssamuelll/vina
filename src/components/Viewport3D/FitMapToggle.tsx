/**
 * FitMapToggle — CLO3D-replica toggle bar + scale + click-to-inspect for Garment Fit Maps.
 *
 * Visual fidelity targets:
 * - Toggle icons in a compact horizontal bar (top-right of 3D viewport)
 * - Vertical color scale bar on the right edge with tick labels
 * - Click-to-inspect: clicking a garment point shows the value at that location
 * - Fit Map summary table (Can't Wear / Tight / OK percentages)
 * - Keyboard shortcuts: Alt+6 (Stress), Alt+7 (Strain), Alt+8 (Fit), Alt+9 (Pressure)
 * - Shift+A to toggle avatar visibility
 *
 * @module FitMapToggle
 */

import { useCallback, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store';
import { setFitMapMode, updateFitMapConfig } from '../../store/simulationSlice';
import type { FitMapMode, FitMapStats } from '../../utils/cloth/fitMaps';
import { DEFAULT_FIT_MAP_CONFIG } from '../../utils/cloth/fitMaps';

// ─── Types ──────────────────────────────────────────────────────────────────

interface FitMapToggleProps {
  /** Current fit map stats (from ClothMesh computation) */
  stats?: FitMapStats | null;
  /** Value at clicked point (from raycaster) */
  inspectedValue?: number | null;
  /** Whether avatar is hidden */
  avatarHidden?: boolean;
  /** Toggle avatar visibility */
  onToggleAvatar?: () => void;
  /** Snapshot the 3D viewport */
  onSnapshot?: () => void;
}

// ─── CLO3D 8-stop color scale (exact match) ────────────────────────────────

const SCALE_COLORS_8 = [
  '#0000FF', // 0.00
  '#0066FF', // 14.3
  '#00CCCC', // 28.6
  '#00FF66', // 42.8
  '#66FF00', // 57.1
  '#FFFF00', // 71.4
  '#FF8800', // 85.7
  '#FF0000', // 100
];

// ─── Mode definitions ───────────────────────────────────────────────────────

interface ModeInfo {
  mode: FitMapMode;
  label: string;
  shortcut: string;
  /** SVG icon path */
  icon: string;
}

const MODES: ModeInfo[] = [
  {
    mode: 'stress',
    label: 'Mapa de tensión',
    shortcut: 'Alt+6',
    // Thermometer-style icon
    icon: 'M12 2a3 3 0 0 0-3 3v8.17a5 5 0 1 0 6 0V5a3 3 0 0 0-3-3Z',
  },
  {
    mode: 'strain',
    label: 'Mapa de estiramiento',
    shortcut: 'Alt+7',
    // Stretch/expand arrows icon
    icon: 'M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4',
  },
  {
    mode: 'fit',
    label: 'Mapa de ajuste',
    shortcut: 'Alt+8',
    // Person/fit icon
    icon: 'M12 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2',
  },
  {
    mode: 'pressure',
    label: 'Puntos de presión',
    shortcut: 'Alt+9',
    // Contact/dot grid icon
    icon: 'M12 12m-2 0a2 2 0 1 0 4 0 2 2 0 1 0-4 0M5 5m-1.5 0a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0M19 5m-1.5 0a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0M5 19m-1.5 0a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0M19 19m-1.5 0a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0',
  },
];

// ─── Styles ─────────────────────────────────────────────────────────────────

const S = {
  // Toggle bar — CLO3D uses a compact dark bar with small square icons
  toggleBar: {
    position: 'absolute' as const,
    top: 8,
    // Deja el carril right:8..130 al SurfaceModePill (Fase1-S3): esta barra
    // crece hacia la izquierda y a right:48 se montaba sobre el pill.
    right: 130,
    display: 'flex',
    gap: 1,
    zIndex: 10,
    background: '#2a2a2a',
    borderRadius: 4,
    padding: 2,
    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
  },
  toggleBtn: (active: boolean) => ({
    width: 32,
    height: 32,
    display: 'flex',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    background: active ? '#4a90d9' : 'transparent',
    border: 'none',
    borderRadius: 3,
    cursor: 'pointer',
    padding: 0,
    transition: 'background 0.15s',
  }),
  toggleIcon: (active: boolean) => ({
    width: 18,
    height: 18,
    color: active ? '#fff' : '#999',
  }),
  // Vertical scale bar — right edge, CLO3D style
  scaleContainer: {
    position: 'absolute' as const,
    top: 48,
    right: 12,
    bottom: 48,
    width: 28,
    zIndex: 10,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center' as const,
    pointerEvents: 'none' as const,
  },
  scaleBar: {
    width: 14,
    flex: 1,
    borderRadius: 2,
    border: '1px solid rgba(255,255,255,0.2)',
  },
  scaleTick: {
    fontSize: 9,
    fontFamily: 'var(--font-sans)',
    color: '#fff',
    textShadow: '0 1px 3px rgba(0,0,0,0.8)',
    lineHeight: '1',
    userSelect: 'none' as const,
  },
  // Fit Map summary table (top-right)
  fitTable: {
    position: 'absolute' as const,
    top: 48,
    right: 48,
    background: 'rgba(30,30,30,0.92)',
    borderRadius: 4,
    padding: '8px 12px',
    zIndex: 10,
    fontFamily: 'var(--font-sans)',
    fontSize: 11,
    color: '#fff',
    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
    minWidth: 140,
  },
  // Inspected value tooltip
  inspectTooltip: {
    position: 'absolute' as const,
    background: 'rgba(0,0,0,0.88)',
    color: '#fff',
    padding: '3px 8px',
    borderRadius: 3,
    fontSize: 11,
    fontFamily: 'var(--font-mono)',
    fontWeight: 600 as const,
    pointerEvents: 'none' as const,
    zIndex: 20,
    whiteSpace: 'nowrap' as const,
    boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
  },
  // Config popover panel
  configPanel: {
    position: 'absolute' as const,
    top: 44,
    right: 0,
    background: 'rgba(30,30,30,0.96)',
    borderRadius: 4,
    padding: '10px 14px',
    zIndex: 20,
    fontFamily: 'var(--font-sans)',
    fontSize: 11,
    color: '#fff',
    boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
    minWidth: 200,
  },
  configRow: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginBottom: 6,
    gap: 6,
  },
  configLabel: {
    fontSize: 11,
    color: '#bbb',
    whiteSpace: 'nowrap' as const,
  },
  configInput: {
    width: 50,
    background: '#333',
    border: '1px solid #555',
    borderRadius: 3,
    color: '#fff',
    padding: '2px 4px',
    fontSize: 11,
    fontVariantNumeric: 'tabular-nums' as const,
  },
  configResetBtn: {
    marginTop: 4,
    width: '100%' as const,
    background: '#444',
    border: '1px solid #666',
    borderRadius: 3,
    color: '#ccc',
    padding: '4px 8px',
    fontSize: 10,
    cursor: 'pointer',
  },
};

// ─── Component ──────────────────────────────────────────────────────────────

export default function FitMapToggle({ stats, inspectedValue, avatarHidden, onToggleAvatar, onSnapshot }: FitMapToggleProps) {
  const dispatch = useDispatch();
  const simulationState = useSelector((s: RootState) => s.simulation.simulationState);
  const fitMapMode = useSelector((s: RootState) => s.simulation.fitMapMode);
  const fitMapConfig = useSelector((s: RootState) => s.simulation.fitMapConfig);
  const [hovered, setHovered] = useState<FitMapMode | null>(null);
  const [showConfig, setShowConfig] = useState(false);

  const toggle = useCallback((mode: FitMapMode) => {
    dispatch(setFitMapMode(fitMapMode === mode ? 'none' : mode));
  }, [dispatch, fitMapMode]);

  if (simulationState === 'idle') return null;

  const showScale = fitMapMode === 'stress' || fitMapMode === 'strain';
  const showFitTable = fitMapMode === 'fit' && stats;

  return (
    <>
      {/* ── Toggle Bar ── */}
      <div style={S.toggleBar}>
        {MODES.map(({ mode, label, shortcut, icon }) => (
          <button
            key={mode}
            onClick={() => toggle(mode)}
            onMouseEnter={() => setHovered(mode)}
            onMouseLeave={() => setHovered(null)}
            title={`${label} (${shortcut})`}
            style={S.toggleBtn(fitMapMode === mode)}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={S.toggleIcon(fitMapMode === mode)}
            >
              <path d={icon} />
            </svg>
          </button>
        ))}
        {/* Separator + Avatar toggle */}
        <div style={{ width: 1, background: '#555', margin: '4px 2px' }} />
        <button
          onClick={onToggleAvatar}
          title={`${avatarHidden ? 'Mostrar' : 'Ocultar'} avatar (Shift+A)`}
          style={S.toggleBtn(!avatarHidden)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={S.toggleIcon(!avatarHidden)}>
            <path d="M12 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
            {avatarHidden && <path d="M1 1l22 22" strokeWidth={2.5} stroke="#ff4444" />}
          </svg>
        </button>

        <button
          onClick={onSnapshot}
          title="Captura del visor 3D (F10)"
          style={S.toggleBtn(false)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={S.toggleIcon(false)}>
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>

        {/* Config gear button */}
        <button
          onClick={() => setShowConfig(!showConfig)}
          title="Ajustes del mapa de ajuste"
          style={S.toggleBtn(showConfig)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={S.toggleIcon(showConfig)}>
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
          </svg>
        </button>

        {/* Config popover */}
        {showConfig && (
          <div style={S.configPanel}>
            <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 12 }}>Ajustes del mapa de ajuste</div>

            {/* Stress Range */}
            <div style={{ ...S.configLabel, marginBottom: 2 }}>Rango de tensión (kPa)</div>
            <div style={S.configRow}>
              <label style={S.configLabel}>
                Mín
                <input
                  type="number"
                  aria-label="Tensión mín"
                  style={{ ...S.configInput, marginLeft: 4 }}
                  value={fitMapConfig.stressRange[0]}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!isNaN(v)) dispatch(updateFitMapConfig({ stressRange: [v, fitMapConfig.stressRange[1]] }));
                  }}
                />
              </label>
              <label style={S.configLabel}>
                Máx
                <input
                  type="number"
                  aria-label="Tensión máx"
                  style={{ ...S.configInput, marginLeft: 4 }}
                  value={fitMapConfig.stressRange[1]}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!isNaN(v)) dispatch(updateFitMapConfig({ stressRange: [fitMapConfig.stressRange[0], v] }));
                  }}
                />
              </label>
            </div>

            {/* Strain Range */}
            <div style={{ ...S.configLabel, marginBottom: 2 }}>Rango de estiramiento (%)</div>
            <div style={S.configRow}>
              <label style={S.configLabel}>
                Mín
                <input
                  type="number"
                  aria-label="Estiramiento mín"
                  style={{ ...S.configInput, marginLeft: 4 }}
                  value={+(fitMapConfig.strainRange[0] * 100).toFixed(1)}
                  step={1}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!isNaN(v)) dispatch(updateFitMapConfig({ strainRange: [v / 100, fitMapConfig.strainRange[1]] }));
                  }}
                />
              </label>
              <label style={S.configLabel}>
                Máx
                <input
                  type="number"
                  aria-label="Estiramiento máx"
                  style={{ ...S.configInput, marginLeft: 4 }}
                  value={+(fitMapConfig.strainRange[1] * 100).toFixed(1)}
                  step={1}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!isNaN(v)) dispatch(updateFitMapConfig({ strainRange: [fitMapConfig.strainRange[0], v / 100] }));
                  }}
                />
              </label>
            </div>

            {/* Fit Thresholds */}
            <div style={{ ...S.configLabel, marginBottom: 2 }}>Umbrales de ajuste (%)</div>
            <div style={S.configRow}>
              <label style={S.configLabel}>
                Apretado
                <input
                  type="number"
                  aria-label="Umbral apretado"
                  style={{ ...S.configInput, marginLeft: 4 }}
                  value={+(fitMapConfig.fitThresholds[0] * 100).toFixed(1)}
                  step={1}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!isNaN(v)) dispatch(updateFitMapConfig({ fitThresholds: [v / 100, fitMapConfig.fitThresholds[1]] }));
                  }}
                />
              </label>
              <label style={S.configLabel}>
                No entra
                <input
                  type="number"
                  aria-label="Umbral no entra"
                  style={{ ...S.configInput, marginLeft: 4 }}
                  value={+(fitMapConfig.fitThresholds[1] * 100).toFixed(1)}
                  step={1}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!isNaN(v)) dispatch(updateFitMapConfig({ fitThresholds: [fitMapConfig.fitThresholds[0], v / 100] }));
                  }}
                />
              </label>
            </div>

            {/* Pressure Distance */}
            <div style={{ ...S.configLabel, marginBottom: 2 }}>Distancia de presión (mm)</div>
            <div style={S.configRow}>
              <label style={S.configLabel}>
                Distancia
                <input
                  type="number"
                  aria-label="Distancia de presión"
                  style={{ ...S.configInput, marginLeft: 4 }}
                  value={+(fitMapConfig.pressureDistance * 1000).toFixed(1)}
                  step={0.1}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!isNaN(v)) dispatch(updateFitMapConfig({ pressureDistance: v / 1000 }));
                  }}
                />
              </label>
            </div>

            {/* Reset to defaults */}
            <button
              style={S.configResetBtn}
              onClick={() => dispatch(updateFitMapConfig(DEFAULT_FIT_MAP_CONFIG))}
            >
              Restablecer valores
            </button>
          </div>
        )}

        {/* Hover tooltip */}
        {hovered && (
          <div style={{
            ...S.inspectTooltip,
            position: 'absolute',
            top: 38,
            left: '50%',
            transform: 'translateX(-50%)',
          }}>
            {MODES.find(m => m.mode === hovered)?.label} ({MODES.find(m => m.mode === hovered)?.shortcut})
          </div>
        )}
      </div>

      {/* ── Vertical Color Scale (Stress / Strain) ── */}
      {showScale && (
        <div style={S.scaleContainer}>
          <span style={{ ...S.scaleTick, marginBottom: 4 }}>
            {fitMapMode === 'stress'
              ? `${fitMapConfig.stressRange[1]} kPa`
              : `${(fitMapConfig.strainRange[1] * 100).toFixed(0)}%`}
          </span>
          <div
            style={{
              ...S.scaleBar,
              background: `linear-gradient(to bottom, ${[...SCALE_COLORS_8].reverse().join(', ')})`,
            }}
          />
          <span style={{ ...S.scaleTick, marginTop: 4 }}>
            {fitMapMode === 'stress'
              ? `${fitMapConfig.stressRange[0]} kPa`
              : `${(fitMapConfig.strainRange[0] * 100).toFixed(0)}%`}
          </span>
          {/* Min/Max indicators */}
          {stats && (
            <div style={{
              marginTop: 6,
              textAlign: 'center' as const,
              ...S.scaleTick,
              fontSize: 8,
              opacity: 0.7,
            }}>
              <div>max {fitMapMode === 'stress' ? `${stats.max.toFixed(1)} kPa` : `${stats.max.toFixed(1)}%`}</div>
              <div>avg {fitMapMode === 'stress' ? `${stats.mean.toFixed(1)} kPa` : `${stats.mean.toFixed(1)}%`}</div>
            </div>
          )}
        </div>
      )}

      {/* ── Fit Map Summary Table (CLO3D top-right panel) ── */}
      {showFitTable && stats && (
        <div style={S.fitTable}>
          <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 12 }}>Mapa de ajuste</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' as const }}>
            <tbody>
              <tr>
                <td style={{ padding: '2px 0' }}>
                  <span style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    background: '#ff0000',
                    borderRadius: 1,
                    marginRight: 6,
                    verticalAlign: 'middle',
                  }} />
                  No entra
                </td>
                <td style={{ textAlign: 'right' as const, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  {stats.cantWearPct.toFixed(1)}%
                </td>
              </tr>
              <tr>
                <td style={{ padding: '2px 0' }}>
                  <span style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    background: '#ffff00',
                    borderRadius: 1,
                    marginRight: 6,
                    verticalAlign: 'middle',
                  }} />
                  Apretado
                </td>
                <td style={{ textAlign: 'right' as const, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  {stats.tightPct.toFixed(1)}%
                </td>
              </tr>
              <tr>
                <td style={{ padding: '2px 0' }}>
                  <span style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    background: '#ffffff',
                    border: '1px solid #666',
                    borderRadius: 1,
                    marginRight: 6,
                    verticalAlign: 'middle',
                  }} />
                  Bien
                </td>
                <td style={{ textAlign: 'right' as const, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  {(100 - stats.cantWearPct - stats.tightPct).toFixed(1)}%
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* ── Pressure Points Legend ── */}
      {fitMapMode === 'pressure' && stats && (
        <div style={S.fitTable}>
          <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 12 }}>Puntos de presión</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#ff00cc',
              display: 'inline-block',
            }} />
            <span>Contacto: <b>{stats.pressurePointCount}</b></span>
          </div>
        </div>
      )}

      {/* ── Click-to-Inspect Value Display ── */}
      {fitMapMode !== 'none' && inspectedValue != null && (
        <div style={{
          ...S.inspectTooltip,
          bottom: 48,
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: 14,
          padding: '6px 14px',
        }}>
          {formatInspectedValue(fitMapMode, inspectedValue)}
        </div>
      )}
    </>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatInspectedValue(mode: FitMapMode, value: number): string {
  switch (mode) {
    case 'stress': return `${value.toFixed(2)} kPa`;
    case 'strain': return `${value.toFixed(1)}%`;
    case 'fit': return `${(value * 100).toFixed(1)}%`;
    case 'pressure': return value > 0.5 ? 'Contacto' : 'Sin contacto';
    default: return '';
  }
}
