/**
 * CopilotPlanView — Displays and controls plan execution.
 *
 * Shows:
 * - Plan steps with status indicators
 * - Progress bar
 * - Play/pause/step controls
 * - Step details on hover/click
 */

import { useState, useCallback } from 'react';
import type { CopilotPlan, PlanStep, PlanStatus } from '../../copilot/planner/planTypes';
import { calculatePlanProgress, getPlanStats } from '../../copilot/planner/planTypes';
import './CopilotPlanView.css';

// ============================================================================
// Types
// ============================================================================

export interface CopilotPlanViewProps {
  /** The plan to display */
  plan: CopilotPlan;
  /** Called when user wants to execute all steps */
  onExecuteAll?: () => void;
  /** Called when user wants to execute next step */
  onExecuteNext?: () => void;
  /** Called when user wants to pause execution */
  onPause?: () => void;
  /** Called when user wants to resume execution */
  onResume?: () => void;
  /** Called when user wants to cancel execution */
  onCancel?: () => void;
  /** Called when user wants to skip a step */
  onSkipStep?: (stepId: string) => void;
  /** Called when user wants to close the plan view */
  onClose?: () => void;
  /** Whether controls are disabled */
  disabled?: boolean;
}

// ============================================================================
// Helper Components
// ============================================================================

/**
 * Status indicator icon.
 */
function StatusIcon({ status }: { status: PlanStep['status'] | PlanStatus }) {
  switch (status) {
    case 'pending':
    case 'draft':
    case 'ready':
      return <span className="copilot-plan-status-icon pending">○</span>;
    case 'running':
      return <span className="copilot-plan-status-icon running">◎</span>;
    case 'completed':
      return <span className="copilot-plan-status-icon completed">✓</span>;
    case 'failed':
      return <span className="copilot-plan-status-icon failed">✗</span>;
    case 'skipped':
      return <span className="copilot-plan-status-icon skipped">⊘</span>;
    case 'paused':
      return <span className="copilot-plan-status-icon paused">⏸</span>;
    case 'cancelled':
      return <span className="copilot-plan-status-icon cancelled">⏹</span>;
    default:
      return <span className="copilot-plan-status-icon">○</span>;
  }
}

/**
 * Progress bar component.
 */
function ProgressBar({ progress }: { progress: number }) {
  return (
    <div className="copilot-plan-progress">
      <div className="copilot-plan-progress-track">
        <div
          className="copilot-plan-progress-fill"
          style={{ width: `${progress}%` }}
        />
      </div>
      <span className="copilot-plan-progress-text">{progress}%</span>
    </div>
  );
}

/**
 * Single step row.
 */
function PlanStepRow({
  step,
  isActive,
  onSkip,
  disabled,
}: {
  step: PlanStep;
  isActive: boolean;
  onSkip?: () => void;
  disabled?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  const canSkip =
    step.status === 'pending' && step.optional && !disabled;

  return (
    <div
      className={`copilot-plan-step ${step.status} ${isActive ? 'active' : ''}`}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="copilot-plan-step-header">
        <StatusIcon status={step.status} />
        <span className="copilot-plan-step-number">{step.stepNumber}.</span>
        <span className="copilot-plan-step-description">{step.description}</span>
        {step.optional && (
          <span className="copilot-plan-step-optional">optional</span>
        )}
        {canSkip && (
          <button
            className="copilot-plan-step-skip"
            onClick={(e) => {
              e.stopPropagation();
              onSkip?.();
            }}
          >
            Skip
          </button>
        )}
      </div>

      {expanded && (step.details || step.resultMessage || step.errorMessage) && (
        <div className="copilot-plan-step-details">
          {step.details && (
            <p className="copilot-plan-step-detail-text">{step.details}</p>
          )}
          {step.resultMessage && (
            <p className="copilot-plan-step-result">{step.resultMessage}</p>
          )}
          {step.errorMessage && (
            <p className="copilot-plan-step-error">{step.errorMessage}</p>
          )}
          {step.durationMs && (
            <p className="copilot-plan-step-duration">
              Duration: {step.durationMs}ms
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function CopilotPlanView({
  plan,
  onExecuteAll,
  onExecuteNext,
  onPause,
  onResume,
  onCancel,
  onSkipStep,
  onClose,
  disabled = false,
}: CopilotPlanViewProps) {
  const progress = calculatePlanProgress(plan);
  const stats = getPlanStats(plan);

  const isRunning = plan.status === 'running';
  const isPaused = plan.status === 'paused';
  const isComplete = plan.status === 'completed';
  const isFailed = plan.status === 'failed';
  const isCancelled = plan.status === 'cancelled';
  const canStart = plan.status === 'draft' || plan.status === 'ready';
  const canControl = isRunning || isPaused;

  const handleExecuteAll = useCallback(() => {
    onExecuteAll?.();
  }, [onExecuteAll]);

  const handleExecuteNext = useCallback(() => {
    onExecuteNext?.();
  }, [onExecuteNext]);

  const handlePauseResume = useCallback(() => {
    if (isPaused) {
      onResume?.();
    } else {
      onPause?.();
    }
  }, [isPaused, onPause, onResume]);

  const handleCancel = useCallback(() => {
    onCancel?.();
  }, [onCancel]);

  return (
    <div className="copilot-plan-view">
      {/* Header */}
      <div className="copilot-plan-header">
        <div className="copilot-plan-title-row">
          <StatusIcon status={plan.status} />
          <h3 className="copilot-plan-title">{plan.title}</h3>
          {onClose && (
            <button
              className="copilot-plan-close"
              onClick={onClose}
              aria-label="Close plan"
            >
              ×
            </button>
          )}
        </div>
        <p className="copilot-plan-summary">{plan.summary}</p>
      </div>

      {/* Progress */}
      <ProgressBar progress={progress} />

      {/* Stats */}
      <div className="copilot-plan-stats">
        <span className="copilot-plan-stat">
          <span className="copilot-plan-stat-value">{stats.completed}</span>
          <span className="copilot-plan-stat-label">done</span>
        </span>
        <span className="copilot-plan-stat">
          <span className="copilot-plan-stat-value">{stats.pending}</span>
          <span className="copilot-plan-stat-label">pending</span>
        </span>
        {stats.failed > 0 && (
          <span className="copilot-plan-stat failed">
            <span className="copilot-plan-stat-value">{stats.failed}</span>
            <span className="copilot-plan-stat-label">failed</span>
          </span>
        )}
        {stats.skipped > 0 && (
          <span className="copilot-plan-stat">
            <span className="copilot-plan-stat-value">{stats.skipped}</span>
            <span className="copilot-plan-stat-label">skipped</span>
          </span>
        )}
      </div>

      {/* Controls */}
      <div className="copilot-plan-controls">
        {canStart && (
          <>
            <button
              className="copilot-plan-btn primary"
              onClick={handleExecuteAll}
              disabled={disabled}
            >
              Execute All
            </button>
            <button
              className="copilot-plan-btn secondary"
              onClick={handleExecuteNext}
              disabled={disabled}
            >
              Step by Step
            </button>
          </>
        )}

        {canControl && (
          <>
            <button
              className="copilot-plan-btn secondary"
              onClick={handlePauseResume}
              disabled={disabled}
            >
              {isPaused ? 'Resume' : 'Pause'}
            </button>
            {!isPaused && (
              <button
                className="copilot-plan-btn secondary"
                onClick={handleExecuteNext}
                disabled={disabled}
              >
                Next Step
              </button>
            )}
            <button
              className="copilot-plan-btn danger"
              onClick={handleCancel}
              disabled={disabled}
            >
              Cancel
            </button>
          </>
        )}

        {(isComplete || isFailed || isCancelled) && onClose && (
          <button
            className="copilot-plan-btn secondary"
            onClick={onClose}
          >
            Close
          </button>
        )}
      </div>

      {/* Status message */}
      {isComplete && (
        <div className="copilot-plan-message success">
          Plan completed successfully!
        </div>
      )}
      {isFailed && (
        <div className="copilot-plan-message error">
          Plan failed. Check the step details for errors.
        </div>
      )}
      {isCancelled && (
        <div className="copilot-plan-message warning">
          Plan was cancelled.
        </div>
      )}

      {/* Steps list */}
      <div className="copilot-plan-steps">
        {plan.steps.map((step, index) => (
          <PlanStepRow
            key={step.id}
            step={step}
            isActive={index === plan.currentStepIndex && isRunning}
            onSkip={onSkipStep ? () => onSkipStep(step.id) : undefined}
            disabled={disabled}
          />
        ))}
      </div>

      {/* Duration */}
      {plan.actualDurationMs && (
        <div className="copilot-plan-duration">
          Total time: {Math.round(plan.actualDurationMs / 1000)}s
        </div>
      )}
    </div>
  );
}

export default CopilotPlanView;
