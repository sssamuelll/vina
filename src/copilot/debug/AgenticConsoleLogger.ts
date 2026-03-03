import type { AgenticRecord } from './types';

export class AgenticConsoleLogger {
  log(record: AgenticRecord): void {
    const status = record.success ? '\u2713' : '\u2717';
    const color = record.success ? 'color: green' : 'color: red';
    console.group(
      `%c[AgenticLoop] "${record.userRequest}" (${record.totalDuration}ms) ${status}`,
      `font-weight: bold; ${color}`
    );

    if (record.toolCalls.length > 0) {
      console.groupCollapsed(`\u26A1 Tool calls (${record.toolCalls.length})`);
      for (const tc of record.toolCalls) {
        const typeLabel = tc.isMetaTool ? 'read' : 'write';
        const resultPreview = JSON.stringify(tc.result).slice(0, 100);
        console.log(
          `  ${tc.name} [${typeLabel}] (${Math.round(tc.duration)}ms) → ${resultPreview}`
        );
      }
      console.groupEnd();
    }

    console.log('Response:', record.finalResponse.slice(0, 200));

    if (record.error) {
      console.error('Error:', record.error);
    }

    console.groupEnd();
  }
}
