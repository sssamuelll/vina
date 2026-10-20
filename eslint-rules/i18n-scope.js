/**
 * Where vina/no-literal-ui-string does not apply (i18n spec § 8.1). Each entry
 * says why; model-facing text is not UI text, and tests assert what they render.
 */
export const I18N_EXCLUDED = [
  { files: 'src/i18n/**', reason: 'the catalog itself' },
  { files: '**/__tests__/**', reason: 'tests assert the text they render' },
  { files: '**/*.test.{ts,tsx}', reason: 'tests assert the text they render' },
  { files: 'tests/**', reason: 'tests assert the text they render' },
  { files: 'src/copilot/action/tools/definitions/**', reason: 'model-facing: tool descriptions and schemas the model reads (spec § 8.1)' },
  { files: 'src/copilot/reasoning/bridge/**', reason: 'model-facing: prompt builders (spec § 8.1; domainBootstrap.ts:41 is prompt text)' },
  { files: 'src/copilot/llm/**', reason: "model-facing: builds the system prompt's action section (actionSchemas.ts:507 generateActionsPromptSection) and retry feedback for the model (errorRecovery.ts:64); no module outside the directory imports it" },
  { files: 'src/copilot/perception/**', reason: 'model-facing: audit messages reach the person only through the model (toolExecutor.ts:20 formatAuditResultsForLLM); copilot context is serialized into the prompt (llm/conversationManager.ts:20)' },
  { files: 'src/copilot/reasoning/proactiveAnalysis.ts', reason: 'model-facing: its messages are returned to the model as verb results (superficie/verbos/medir.ts:155-157) and by a meta-tool (reasoning/bridge/meta-tools/verifyGarment.ts:25)' },
  { files: 'src/components/Debug/**', reason: 'DEV only: SolverMetrics.tsx:36 returns null outside import.meta.env.DEV' },
  { files: 'src/components/testScenes/**', reason: 'DEV only: mounted only behind import.meta.env.DEV (App.tsx:38, App.tsx:48)' },
  { files: 'src/utils/cloth/gpu/gpuSolver.ts', reason: 'WebGPU descriptor labels (gpuSolver.ts:300 createCommandEncoder({ label })): debug names for GPU validation errors and devtools, never UI' },
  { files: 'src/utils/cloth/gpu/gpuBuffers.ts', reason: 'WebGPU descriptor labels (gpuBuffers.ts:432): debug names for GPU validation errors and devtools, never UI' },
];
