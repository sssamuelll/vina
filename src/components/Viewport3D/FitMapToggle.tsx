/**
 * FitMapToggle — CLO3D-style toggle bar for Garment Fit Maps.
 *
 * Displays 4 map mode buttons + active map legend/stats overlay.
 * Only visible when simulation is running.
 *
 * Keyboard shortcuts match CLO3D: Alt+6 (Stress), Alt+7 (Strain), Alt+8 (Fit).
 *
 * @module FitMapToggle
 */

import { useCallback, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store';
import { setFitMapMode } from '../../store/simulationSlice';
import type { FitMapMode, FitMapStats } from '../../utils/cloth/fitMaps';

// ─── Types ──────────────────────────────────────────────────────────────────

interface FitMapToggleProps {
  /** Current fit map stats (from ClothMesh computation) */
  stats?: FitMapStats | null;
}

// ─── Mode Config ────────────────────────────────────────────────────────────

const MODES: { mode: FitMapMode; label: string; icon: string; shortcut: string }[] = [
  { mode: 'stress', label: 'Stress', icon: '🔴', shortcut: 'Alt+6' },
  { mode: 'strain', label: 'Strain', icon: '🟡', shortcut: 'Alt+7' },
  { mode: 'fit', label: 'Fit', icon: '🟢', shortcut: 'Alt+8' },
  { mode: 'pressure', label: 'Pressure', icon: '⚫', shortcut: 'Alt+9' },
];

// ─── Component ──────────────────────────────────────────────────────────────

export default function FitMapToggle({ stats }: FitMapToggleProps) {
  const dispatch = useDispatch();
  const simulationState = useSelector((s: RootState) => s.simulation.simulationState);
  const fitMapMode = useSelector((s: RootState) => s.simulation.fitMapMode);

  const toggle = useCallback((mode: FitMapMode) => {
    dispatch(setFitMapMode(fitMapMode === mode ? 'none' : mode));
  }, [dispatch, fitMapMode]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.altKey) return;
      switch (e.key) {
        case '6': e.preventDefault(); toggle('stress'); break;
        case '7': e.preventDefault(); toggle('strain'); break;
        case '8': e.preventDefault(); toggle('fit'); break;
        case '9': e.preventDefault(); toggle('pressure'); break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggle]);

  if (simulationState === 'idle') return null;

  return (
    <>
      {/* Toggle buttons */}
      <div style={{
        position: 'absolute',
        top: 8,
        right: 8,
        display: 'flex',
        gap: 4,
        zIndex: 10,
      }}>
        {MODES.map(({ mode, label, icon, shortcut }) => (
          <button
            key={mode}
            onClick={() => toggle(mode)}
            title={`${label} Map (${shortcut})`}
            style={{
              padding: '4px 10px',
              fontSize: 12,
              fontWeight: fitMapMode === mode ? 700 : 400,
              background: fitMapMode === mode ? '#222' : '#f5f5f5',
              color: fitMapMode === mode ? '#fff' : '#333',
              border: `1px solid ${fitMapMode === mode ? '#555' : '#ccc'}`,
              borderRadius: 4,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              transition: 'all 0.15s',
            }}
          >
            <span>{icon}</span>
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* Legend + Stats overlay */}
      {fitMapMode !== 'none' && stats && (
        <div style={{
          position: 'absolute',
          top: 44,
          right: 8,
          background: 'rgba(0,0,0,0.85)',
          color: '#fff',
          padding: '8px 12px',
          borderRadius: 6,
          fontSize: 11,
          fontFamily: 'monospace',
          zIndex: 10,
          minWidth: 160,
        }}>
          {fitMapMode === 'stress' && <StressLegend stats={stats} />}
          {fitMapMode === 'strain' && <StrainLegend stats={stats} />}
          {fitMapMode === 'fit' && <FitLegend stats={stats} />}
          {fitMapMode === 'pressure' && <PressureLegend stats={stats} />}
        </div>
      )}
    </>
  );
}

// ─── Legends ────────────────────────────────────────────────────────────────

function StressLegend({ stats }: { stats: FitMapStats }) {
  return (
    <div>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>Stress Map (kPa)</div>
      <GradientBar colors={['#0000ff', '#00cccc', '#00ff66', '#ffff00', '#ff8800', '#ff0000']} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
        <span>0</span><span>100</span>
      </div>
      <div style={{ marginTop: 4, fontSize: 10, opacity: 0.8 }}>
        Min: {stats.min.toFixed(1)} | Max: {stats.max.toFixed(1)} | Avg: {stats.mean.toFixed(1)}
      </div>
    </div>
  );
}

function StrainLegend({ stats }: { stats: FitMapStats }) {
  return (
    <div>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>Strain Map (%)</div>
      <GradientBar colors={['#0000ff', '#00cccc', '#00ff66', '#ffff00', '#ff8800', '#ff0000']} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
        <span>100%</span><span>120%</span>
      </div>
      <div style={{ marginTop: 4, fontSize: 10, opacity: 0.8 }}>
        Min: {stats.min.toFixed(1)}% | Max: {stats.max.toFixed(1)}%
      </div>
    </div>
  );
}

function FitLegend({ stats }: { stats: FitMapStats }) {
  return (
    <div>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>Fit Map</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <span style={{ width: 10, height: 10, background: '#fff', border: '1px solid #666', display: 'inline-block' }} />
          OK
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <span style={{ width: 10, height: 10, background: '#ffff00', display: 'inline-block' }} />
          Tight
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <span style={{ width: 10, height: 10, background: '#ff0000', display: 'inline-block' }} />
          Can't Wear
        </span>
      </div>
      <div style={{ fontSize: 10 }}>
        <div>Can't Wear: <b>{stats.cantWearPct.toFixed(1)}%</b></div>
        <div>Tight: <b>{stats.tightPct.toFixed(1)}%</b></div>
        <div>OK: <b>{(100 - stats.cantWearPct - stats.tightPct).toFixed(1)}%</b></div>
      </div>
    </div>
  );
}

function PressureLegend({ stats }: { stats: FitMapStats }) {
  return (
    <div>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>Pressure Points</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <span style={{ width: 10, height: 10, background: '#ff00cc', display: 'inline-block', borderRadius: '50%' }} />
          Contact
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <span style={{ width: 10, height: 10, background: '#4d4d4d', display: 'inline-block', borderRadius: '50%' }} />
          No contact
        </span>
      </div>
      <div style={{ fontSize: 10 }}>
        Points: <b>{stats.pressurePointCount}</b>
      </div>
    </div>
  );
}

function GradientBar({ colors }: { colors: string[] }) {
  return (
    <div style={{
      height: 12,
      borderRadius: 2,
      background: `linear-gradient(to right, ${colors.join(', ')})`,
      marginBottom: 2,
    }} />
  );
}
