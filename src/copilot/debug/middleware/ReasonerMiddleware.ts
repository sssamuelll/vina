import type { IReasoner, ReasonerInput, ReasonerDecision } from '../../reasoning/bridge/types';
import { ExecutionRecorder } from '../ExecutionRecorder';

/**
 * Middleware that wraps an IReasoner to record retry data
 * (decision, duration, attempt count) into the ExecutionRecorder.
 *
 * Used by the debug suite to capture Reasoner invocations
 * without altering the Reasoner's behavior.
 */
export class ReasonerMiddleware implements IReasoner {
  private retryCounters: Map<string, number> = new Map();

  constructor(
    private inner: IReasoner,
    private recorder: ExecutionRecorder
  ) {}

  async analyze(input: ReasonerInput): Promise<ReasonerDecision> {
    const startTime = performance.now();
    const stepId = input.failedStep.id;

    const decision = await this.inner.analyze(input);

    const duration = performance.now() - startTime;
    const currentCount = (this.retryCounters.get(stepId) ?? 0) + 1;
    this.retryCounters.set(stepId, currentCount);

    this.recorder.recordRetry(stepId, currentCount, input.error, input, decision, duration);

    return decision;
  }

  /** Reset per-step retry counters (e.g., between execution runs). */
  resetCounters(): void {
    this.retryCounters.clear();
  }
}
