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
        title="Solver Metrics"
      >
        <span className={`solver-metrics-dot ${isComputing ? 'solver-metrics-dot--active' : ''}`} />
        {isExpanded ? '▼' : '▲'} Solver
      </button>

      {isExpanded && (
        <div className="solver-metrics-body">
          <div className="solver-metrics-row">
            <span>Generation</span>
            <span>{state.generationId}</span>
          </div>
          <div className="solver-metrics-row">
            <span>Pool Ready</span>
            <span>{state.poolReady ? 'Yes' : 'No'}</span>
          </div>
          <div className="solver-metrics-row">
            <span>Pending Jobs</span>
            <span>{state.pendingJobs}</span>
          </div>
          <div className="solver-metrics-row">
            <span>Debounce</span>
            <span>{state.debounceMs}ms</span>
          </div>
          <div className="solver-metrics-row">
            <span>Total Resolves</span>
            <span>{metrics.totalResolves}</span>
          </div>
          <div className="solver-metrics-row">
            <span>Cancelled</span>
            <span>{metrics.cancelledJobs}</span>
          </div>
          <div className="solver-metrics-row">
            <span>Avg Compute</span>
            <span>{avgComputeTime}ms</span>
          </div>

          {strategyEntries.length > 0 && (
            <>
              <div className="solver-metrics-section">Strategy Usage</div>
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
                Recent Errors ({metrics.errors.length})
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
