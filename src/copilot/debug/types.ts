import type {
  ExecutionPlan,
  ExpandableSummary,
  ReasonerInput,
  ReasonerDecision,
} from '../reasoning/bridge/types';

export interface ExecutionRecord {
  id: string;
  timestamp: number;
  userRequest: string;
  duration: number;
  success: boolean;
  planning: PlanningRecord;
  steps: StepRecord[];
  summary?: ExpandableSummary;
  error?: string;
}

export interface PlanningRecord {
  systemPrompt: string;
  toolsProvided: string[];
  rawResponse: string;
  parsedPlan: ExecutionPlan | null;
  parseError?: string;
  duration: number;
  tokenUsage?: TokenUsage;
}

export interface TokenUsage {
  input: number;
  output: number;
}

export interface VariableResolution {
  variable: string;
  resolvedValue: unknown;
}

export interface RetryRecord {
  attempt: number;
  error: string;
  reasonerInput: ReasonerInput;
  reasonerDecision: ReasonerDecision;
  reasonerDuration: number;
  reasonerTokenUsage?: TokenUsage;
}

export interface StepRecord {
  stepId: string;
  tool: string;
  label: string;
  rawParams: Record<string, unknown>;
  resolvedParams: Record<string, unknown>;
  variableResolutions: VariableResolution[];
  success: boolean;
  result?: unknown;
  error?: string;
  duration: number;
  retries: RetryRecord[];
}
