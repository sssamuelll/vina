// src/copilot/bridge/index.ts
/**
 * Bridge Module — Copilot Execution Bridge
 *
 * @module bridge
 */

// Types (includes legacy ToolRegistry, ToolFunction, Evaluator, ReasonerLLM moved from deleted files)
export * from './types';

// Modules (Reasoner, ResultStore, SummaryGenerator, Executor deleted in Task 6 — inlined into ExecutionBridge)
export { Planner, PlannerError } from './Planner';
export type { ToolSchema } from './Planner';
export { ExecutionBridge } from './ExecutionBridge';
export type { BridgeOptions, BridgeResult, PlannerLLM } from './ExecutionBridge';
export { AgenticPlanner } from './AgenticPlanner';
export type { AgenticPlannerOptions, MetaToolCallRecord } from './AgenticPlanner';
export { EnhancedReasoner } from './EnhancedReasoner';
export type { EnhancedReasonerOptions } from './EnhancedReasoner';
export { getAllMetaTools } from './meta-tools';
export { AgenticLoop } from './AgenticLoop';
export type { AgenticLoopOptions, AgenticEvent, AgenticEventHandler, ToolCallRecord } from './AgenticLoop';
