import type { ExecutionRecord, StepRecord, RetryRecord } from './types';

export class ConsoleLogger {
  log(record: ExecutionRecord): void {
    const status = record.success ? '\u2713' : '\u2717';
    const color = record.success ? 'color: green' : 'color: red';
    console.group(
      `%c[Bridge] "${record.userRequest}" (${record.duration}ms) ${status}`,
      `font-weight: bold; ${color}`
    );
    this.logPlanning(record);
    this.logSteps(record.steps);
    if (record.error) {
      console.error('Error:', record.error);
    }
    if (record.summary) {
      console.log('Summary:', record.summary.short);
    }
    console.groupEnd();
  }

  private logPlanning(record: ExecutionRecord): void {
    const p = record.planning;
    console.groupCollapsed(
      `%c\ud83d\udccb Planning (${Math.round(p.duration)}ms${p.tokenUsage ? `, ${p.tokenUsage.input + p.tokenUsage.output} tokens` : ''})`,
      'color: #6366f1'
    );
    console.log('Tools:', p.toolsProvided.join(', '));
    if (p.metaToolCalls && p.metaToolCalls.length > 0) {
      console.log(`%c  Meta-tool calls: ${p.metaToolCalls.length}`, 'color: #9b59b6');
      for (const call of p.metaToolCalls) {
        console.log(`    ${call.name}(${JSON.stringify(call.arguments)}) → ${Math.round(call.duration)}ms`);
      }
    }
    console.groupCollapsed('System prompt');
    console.log(p.systemPrompt);
    console.groupEnd();
    console.groupCollapsed('Raw response');
    console.log(p.rawResponse);
    console.groupEnd();
    if (p.parsedPlan) {
      console.log('Parsed plan:', p.parsedPlan);
    }
    if (p.parseError) {
      console.error('Parse error:', p.parseError);
    }
    console.groupEnd();
  }

  private logSteps(steps: StepRecord[]): void {
    for (let i = 0; i < steps.length; i++) {
      this.logStep(steps[i], i);
    }
  }

  private logStep(step: StepRecord, index: number): void {
    const status = step.success ? '\u2713' : '\u2717';
    const color = step.success ? 'color: green' : 'color: red';
    const retryNote = step.retries.length > 0 ? ` (${step.retries.length} retries)` : '';
    console.group(
      `%c\u26a1 Step ${index + 1}: ${step.tool} (${Math.round(step.duration)}ms) ${status}${retryNote}`,
      color
    );
    if (step.variableResolutions.length > 0) {
      console.log('Params (raw):', step.rawParams);
      console.log('Params (resolved):', step.resolvedParams);
      console.table(
        step.variableResolutions.map(v => ({
          variable: v.variable,
          resolved: JSON.stringify(v.resolvedValue),
        }))
      );
    } else {
      console.log('Params:', step.resolvedParams);
    }
    if (step.success) {
      console.log('Result:', step.result);
    } else {
      console.error('Error:', step.error);
    }
    for (const retry of step.retries) {
      this.logRetry(retry);
    }
    console.groupEnd();
  }

  private logRetry(retry: RetryRecord): void {
    console.warn(`\ud83d\udd04 Retry ${retry.attempt}: ${retry.error}`);
    console.log('  Reasoner decision:', retry.reasonerDecision);
    console.log(`  Reasoner duration: ${Math.round(retry.reasonerDuration)}ms`);
  }
}
