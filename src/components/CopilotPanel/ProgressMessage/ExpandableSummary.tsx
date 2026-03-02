import React from 'react';
import type { ExpandableSummary as ExpandableSummaryType } from '../../../copilot/bridge/types';

export interface ExpandableSummaryProps {
  summary: ExpandableSummaryType;
  expanded: boolean;
  onToggle: () => void;
  onUndo?: () => void;
}

/**
 * ExpandableSummary - Collapsed/expanded summary with controls.
 */
export const ExpandableSummary: React.FC<ExpandableSummaryProps> = ({
  summary,
  expanded,
  onToggle,
  onUndo,
}) => {
  return (
    <div className="progress-summary">
      <div className="progress-summary-header">
        <span className="progress-icon">\u2713</span>
        <span className="progress-summary-short">{summary.short}</span>
        <div className="progress-controls">
          <button
            className="progress-btn"
            onClick={onToggle}
            title={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? '\u25B2' : '\u25BC'}
          </button>
          {onUndo && (
            <button
              className="progress-btn"
              onClick={onUndo}
              title="Undo"
            >
              \u21BA
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="progress-details">
          {summary.details.map((detail, index) => (
            <div key={index} className="progress-detail-item">
              \u2022 {detail}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
