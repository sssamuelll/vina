import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import type { DiagnosticSeverity, AgentSuggestion } from '../../diagnostics/types';
import { useInspector } from '../../hooks/useInspector';
import './InspectorTab.css';

const SEVERITY_ICON: Record<DiagnosticSeverity, string> = {
  error: '🔴',
  critical: '🟠',
  warning: '🟡',
  info: '🔵',
};

const SEVERITY_COLOR: Record<DiagnosticSeverity, string> = {
  error: '#ef4444',
  critical: '#f97316',
  warning: '#eab308',
  info: '#3b82f6',
};

function SuggestionCard({ suggestion }: { suggestion: AgentSuggestion }) {
  return (
    <div className="inspector-suggestion-card">
      <div className="inspector-suggestion-info">
        <div className="inspector-suggestion-desc">{suggestion.description}</div>
        <div className="inspector-suggestion-impact">{suggestion.impact}</div>
      </div>
      {suggestion.toolCall && (
        <button
          className="inspector-suggestion-apply"
          disabled
          title="Coming soon — will auto-apply via copilot bridge"
        >
          Apply
        </button>
      )}
    </div>
  );
}

export default function InspectorTab() {
  useInspector();

  const { target, data, diagnostics, agentAnalysis, agentStreaming, agentError } = useSelector(
    (s: RootState) => s.inspector,
  );

  if (!target) {
    return (
      <div className="inspector-tab inspector-empty">
        <span>Right-click a piece and select &apos;Inspect&apos; to begin</span>
      </div>
    );
  }

  const issueCount = diagnostics.filter((d) => d.severity !== 'info').length;
  const fabricName = data?.fabric?.name;

  return (
    <div className="inspector-tab">
      {/* Header */}
      <div className="inspector-header">
        <div className="inspector-header-left">
          <span className="inspector-piece-name">
            {data?.piece.name ?? target.pieceId}
          </span>
          {target.edgeName && (
            <>
              <span className="inspector-separator">/</span>
              <span className="inspector-edge-name">{target.edgeName}</span>
            </>
          )}
          {fabricName && (
            <span className="inspector-fabric-badge">[{fabricName}]</span>
          )}
        </div>
        {issueCount > 0 && (
          <span className="inspector-issue-count">
            {issueCount} issue{issueCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Diagnostics */}
      {diagnostics.length > 0 && (
        <div className="inspector-diagnostics">
          {diagnostics.map((diag, i) => (
            <div
              key={i}
              className="inspector-diagnostic-row"
              style={{ background: `${SEVERITY_COLOR[diag.severity]}18` }}
            >
              <span className="inspector-diagnostic-icon">
                {SEVERITY_ICON[diag.severity]}
              </span>
              <div className="inspector-diagnostic-content">
                <div style={{ color: SEVERITY_COLOR[diag.severity] }}>
                  {diag.message}
                </div>
                {diag.detail && (
                  <div className="inspector-diagnostic-detail">{diag.detail}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Agent analysis */}
      <div className="inspector-agent">
        {agentStreaming && !agentAnalysis && (
          <div className="inspector-agent-loading">Analyzing…</div>
        )}
        {agentError && (
          <div className="inspector-agent-error">⚠ {agentError}</div>
        )}
        {agentAnalysis && (
          <>
            {agentAnalysis.summary && (
              <div className="inspector-agent-summary">{agentAnalysis.summary}</div>
            )}
            {agentAnalysis.suggestions.map((s, i) => (
              <SuggestionCard key={i} suggestion={s} />
            ))}
          </>
        )}
      </div>

      {/* Raw data (collapsible) */}
      {data && (
        <details className="inspector-raw-data">
          <summary>Raw data</summary>
          <div className="inspector-raw-content">
            <div className="inspector-raw-group">
              <div className="inspector-raw-label">Piece</div>
              <div>id: {data.piece.id}</div>
              <div>position: ({data.piece.position.x.toFixed(2)}, {data.piece.position.y.toFixed(2)})</div>
              <div>rotation: {data.piece.rotation.toFixed(2)}°</div>
              <div>seam allowance: {data.piece.seamAllowance}mm</div>
            </div>
            {data.edge && (
              <div className="inspector-raw-group">
                <div className="inspector-raw-label">Edge</div>
                <div>name: {data.edge.name}</div>
                <div>type: {data.edge.type}</div>
                <div>length: {data.edge.length.toFixed(2)}mm</div>
              </div>
            )}
            {data.seams.length > 0 && (
              <div className="inspector-raw-group">
                <div className="inspector-raw-label">Seams ({data.seams.length})</div>
                {data.seams.map((seam, i) => (
                  <div key={i}>{seam.edgeName} → {seam.partnerPieceName}</div>
                ))}
              </div>
            )}
            {data.internals.length > 0 && (
              <div className="inspector-raw-group">
                <div className="inspector-raw-label">Internals</div>
                {data.internals.map((int, i) => (
                  <div key={i}>{int.type}: {int.count}</div>
                ))}
              </div>
            )}
            {data.simulation && (
              <div className="inspector-raw-group">
                <div className="inspector-raw-label">Simulation</div>
                {data.simulation.particleCount !== undefined && (
                  <div>particles: {data.simulation.particleCount}</div>
                )}
                {data.simulation.collisionDistance !== undefined && (
                  <div>collision distance: {data.simulation.collisionDistance.toFixed(4)}m</div>
                )}
              </div>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
