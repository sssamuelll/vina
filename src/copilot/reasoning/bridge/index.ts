// src/copilot/bridge/index.ts
/**
 * Bridge Module — Copilot Execution Bridge
 *
 * @module bridge
 */

// Types
export * from './types';

// Modules
export { ResultStore } from './ResultStore';
export { SummaryGenerator } from './SummaryGenerator';
export { Planner, PlannerError } from './Planner';
export type { ToolSchema } from './Planner';
export { Executor } from './Executor';
export type { ToolRegistry, ToolFunction, Evaluator, ExecutionResult } from './Executor';
export { Reasoner } from './Reasoner';
export type { ReasonerLLM } from './Reasoner';
export { ExecutionBridge } from './ExecutionBridge';
export type { BridgeOptions, BridgeResult, PlannerLLM } from './ExecutionBridge';
