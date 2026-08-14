/**
 * SolverMetrics — Dev-only metrics dashboard for reactive solver.
 *
 * Shows real-time stats: compute times, pending jobs, strategy usage, errors.
 * Only renders in development mode (import.meta.env.DEV).
 */

import { useState, useEffect, useCallback } from 'react';
import { useSolverMetrics, useSolverStatus } from '../../hooks/useSolverStatus';
import './SolverMetrics.css';

const REFRESH_INTERVAL_MS = 500;

export default function SolverMetrics() {
  const { getMetrics, getState } = useSolverMetrics();
  const { isComputing } = useSolverStatus();
  const [, forceUpdate] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);

  // Auto-refresh metrics
  useEffect(() => {
    if (!isExpanded) return;

    const interval = setInterval(() => {
      forceUpdate(n => n + 1);
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [isExpanded]);

  const toggleExpanded = useCallback(() => {
    setIsExpanded(e => !e);
  }, []);

  // Only render in dev mode
  if (!import.meta.env.DEV) {
    return null;
  }

  const metrics = getMetrics();
  const state = getState();

  // Calculate stats
  const avgComputeTime = metrics.computeTimes.length > 0
    ? (metrics.computeTimes.reduce((a, b) => a + b, 0) / metrics.computeTimes.length).toFixed(1)
    : '-';

  const strategyEntries = Object.entries(metrics.strategyUsage);

  return (
    <div className={`solver-metrics ${isExpanded ? 'solver-metrics--expanded' : ''}`}>
      <button
        className="solver-metrics-toggle"
        onClick={toggleExpanded}
        title="Métricas del solver"
      >
        <span className={`solver-metrics-dot ${isComputing ? 'solver-metrics-dot--active' : ''}`} />
        {isExpanded ? '▼' : '▲'} Solver
      </button>

      {isExpanded && (
        <div className="solver-metrics-body">
          <div className="solver-metrics-row">
            <span>Generación</span>
            <span>{state.generationId}</span>
          </div>
          <div className="solver-metrics-row">
            <span>Pool listo</span>
            <span>{state.poolReady ? 'Sí' : 'No'}</span>
          </div>
          <div className="solver-metrics-row">
            <span>Trabajos pendientes</span>
            <span>{state.pendingJobs}</span>
          </div>
          <div className="solver-metrics-row">
            <span>Retardo</span>
            <span>{state.debounceMs}ms</span>
          </div>
          <div className="solver-metrics-row">
            <span>Resoluciones totales</span>
            <span>{metrics.totalResolves}</span>
          </div>
          <div className="solver-metrics-row">
            <span>Cancelados</span>
            <span>{metrics.cancelledJobs}</span>
          </div>
          <div className="solver-metrics-row">
            <span>Cómputo promedio</span>
            <span>{avgComputeTime}ms</span>
          </div>

          {strategyEntries.length > 0 && (
            <>
              <div className="solver-metrics-section">Uso por estrategia</div>
              {strategyEntries.map(([strategy, count]) => (
                <div className="solver-metrics-row" key={strategy}>
                  <span>{strategy}</span>
                  <span>{count}</span>
                </div>
              ))}
            </>
          )}

          {metrics.errors.length > 0 && (
            <>
              <div className="solver-metrics-section solver-metrics-section--error">
                Errores recientes ({metrics.errors.length})
              </div>
              {metrics.errors.slice(-3).map((error, i) => (
                <div className="solver-metrics-error" key={i}>
                  {error.slice(0, 50)}...
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
