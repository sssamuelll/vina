export interface FormulaContext {
  variables: Record<string, number>;
}

export interface FormulaResult {
  value: number;
  error?: string;
}
