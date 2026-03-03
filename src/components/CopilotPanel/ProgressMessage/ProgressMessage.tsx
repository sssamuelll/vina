import React, { useState } from 'react';
import type { ToolCallProgress } from '../../../copilot/hooks/useAgenticLoop';
import './ProgressMessage.css';

export interface ProgressMessageProps {
  /** Tool calls in progress or completed */
  toolCalls: ToolCallProgress[];
  /** Whether the loop is currently running */
  isRunning: boolean;
  /** Final text response */
  response: string | null;
}

export const ProgressMessage: React.FC<ProgressMessageProps> = ({
  toolCalls,
  isRunning,
  response,
}) => {
  const [expanded, setExpanded] = useState(false);

  if (toolCalls.length === 0 && !isRunning) return null;

  const isDone = !isRunning && response !== null;
  const hasFailed = toolCalls.some(tc => tc.status === 'error');

  const getStatusClass = () => {
    if (hasFailed) return 'progress-failed';
    if (isDone) return 'progress-done';
    return 'progress-running';
  };

  const getStatusIcon = () => {
    if (hasFailed) return '\u2717';
    if (isDone) return '\u2713';
    return '\uD83D\uDCCB';
  };

  return (
    <div className={`progress-message ${getStatusClass()}`}>
      <div className="progress-header">
        <span className="progress-icon">{getStatusIcon()}</span>
        <span className="progress-intent">
          {isDone ? 'Complete' : 'Working...'}
        </span>
        {toolCalls.length > 0 && (
          <button
            className="progress-btn"
            onClick={() => setExpanded(!expanded)}
            title={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? '\u25B2' : '\u25BC'}
          </button>
        )}
      </div>

      {(isRunning || expanded) && (
        <div className="progress-steps">
          {toolCalls.map((tc, i) => (
            <div key={i} className={`progress-step progress-step-${tc.status}`}>
              <span className="progress-step-indicator">
                {tc.status === 'done' ? '\u2713' :
                 tc.status === 'running' ? '\u25CF' :
                 tc.status === 'error' ? '\u2717' : '\u25CB'}
              </span>
              <span className="progress-step-label">{tc.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ProgressMessage;
