import React, { useState } from 'react';
import type { ProgressState } from '../../../copilot/bridge/types';
import './ProgressMessage.css';

export interface ProgressMessageProps {
  /** Current progress state */
  state: ProgressState;
  /** Callback when user answers a question */
  onAnswer?: (answer: string) => void;
  /** Callback when user requests rollback/undo */
  onUndo?: () => void;
}

/**
 * ProgressMessage - Inline progress display for copilot execution.
 * Shows steps, questions, and expandable summaries.
 */
export const ProgressMessage: React.FC<ProgressMessageProps> = ({
  state,
  onAnswer,
  onUndo,
}) => {
  const [expanded, setExpanded] = useState(false);

  const isDone = state.status === 'done';
  const isFailed = state.status === 'failed';
  const isAsking = state.status === 'asking';
  const isRunning = state.status === 'running' || state.status === 'planning';

  // Status icon
  const getStatusIcon = () => {
    if (isDone) return '\u2713'; // checkmark
    if (isFailed) return '\u2717'; // x mark
    if (isAsking) return '\u26A0'; // warning
    return '\uD83D\uDCCB'; // clipboard
  };

  // Status class for styling
  const getStatusClass = () => {
    if (isDone) return 'progress-done';
    if (isFailed) return 'progress-failed';
    if (isAsking) return 'progress-asking';
    return 'progress-running';
  };

  return (
    <div className={`progress-message ${getStatusClass()}`}>
      {/* Header */}
      <div className="progress-header">
        <span className="progress-icon">{getStatusIcon()}</span>
        <span className="progress-intent">
          {isDone && state.summary ? state.summary.short : state.intent}
        </span>

        {/* Controls for done state */}
        {isDone && (
          <div className="progress-controls">
            <button
              className="progress-btn"
              onClick={() => setExpanded(!expanded)}
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
        )}
      </div>

      {/* Steps - show when running or asking or expanded */}
      {(isRunning || isAsking || (isDone && expanded)) && (
        <div className="progress-steps">
          {state.steps.map((step) => (
            <div key={step.id} className={`progress-step progress-step-${step.status}`}>
              <span className="progress-step-indicator">
                {step.status === 'done' ? '\u2713' :
                 step.status === 'running' ? '\u25CF' :
                 step.status === 'failed' ? '\u2717' : '\u25CB'}
              </span>
              <span className="progress-step-label">
                {step.label}
                {step.resultPreview && ` (${step.resultPreview})`}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Question UI */}
      {isAsking && state.question && (
        <div className="progress-question">
          <p className="progress-question-text">{state.question}</p>
          <div className="progress-question-options">
            {state.options?.map((option) => (
              <button
                key={option}
                className="progress-option-btn"
                onClick={() => onAnswer?.(option)}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Expanded details */}
      {isDone && expanded && state.summary && (
        <div className="progress-details">
          {state.summary.details.map((detail, index) => (
            <div key={index} className="progress-detail-item">
              {'\u2022'} {detail}
            </div>
          ))}
        </div>
      )}

      {/* Error message */}
      {isFailed && state.error && (
        <div className="progress-error">
          {state.error}
        </div>
      )}
    </div>
  );
};

export default ProgressMessage;
