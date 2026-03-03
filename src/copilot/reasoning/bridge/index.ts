// src/copilot/reasoning/bridge/index.ts
/**
 * Bridge Module — Copilot Agentic Loop
 *
 * @module bridge
 */

// AgenticLoop
export { AgenticLoop } from './AgenticLoop';
export type { AgenticLoopOptions, AgenticEvent, AgenticEventHandler, ToolCallRecord } from './AgenticLoop';

// Meta-tools
export { getAllMetaTools } from './meta-tools';

// Domain bootstrap
export { buildDomainBootstrap } from './domainBootstrap';
