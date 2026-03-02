import React from 'react';
import type { ProgressStep } from '../../../copilot/reasoning/bridge/types';

export interface ProgressStepsProps {
  steps: ProgressStep[];
}

/**
 * ProgressSteps - Renders the list of execution steps with status indicators.
 */
export const ProgressSteps: React.FC<ProgressStepsProps> = ({ steps }) => {
  const getIndicator = (status: ProgressStep['status']) => {
    switch (status) {
      case 'done': return '\u2713';
      case 'running': return '\u25CF';
      case 'failed': return '\u2717';
      default: return '\u25CB';
    }
  };

  return (
    <div className="progress-steps">
      {steps.map((step, index) => (
        <div
          key={step.id}
          className={`progress-step progress-step-${step.status}`}
          data-last={index === steps.length - 1}
        >
          <span className="progress-step-indicator">
            {getIndicator(step.status)}
          </span>
          <span className="progress-step-label">
            {step.label}
            {step.resultPreview && (
              <span className="progress-step-preview"> ({step.resultPreview})</span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
};
