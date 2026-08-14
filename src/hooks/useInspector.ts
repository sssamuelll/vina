import { useEffect, useRef } from 'react';
import { useSelector, useDispatch, useStore } from 'react-redux';
import type { RootState } from '../store';
import {
  setInspectionData,
  setDiagnostics,
  setAgentAnalysis,
  setAgentStreaming,
  setAgentError,
} from '../store/inspectorSlice';
import { collectInspectionData } from '../diagnostics/dataCollector';
import { evaluateRules } from '../diagnostics/ruleEngine';
import { analyzeInspection } from '../diagnostics/agentAnalyzer';

export function useInspector() {
  const dispatch = useDispatch();
  const reduxStore = useStore<RootState>();
  const target = useSelector((s: RootState) => s.inspector.target);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!target) return;

    // Abort previous analysis
    abortRef.current?.abort();

    // 1. Collect data (sync) — fresh snapshot via useStore
    const state = reduxStore.getState();
    const data = collectInspectionData(target, state);
    dispatch(setInspectionData(data));

    // 2. Evaluate rules (sync)
    const diagnostics = evaluateRules(data);
    dispatch(setDiagnostics(diagnostics));

    // 3. Stream agent analysis (async)
    const controller = new AbortController();
    abortRef.current = controller;
    dispatch(setAgentStreaming(true));

    analyzeInspection(
      data,
      diagnostics,
      (partial) => {
        if (!controller.signal.aborted && (partial.summary || partial.explanations || partial.suggestions)) {
          dispatch(setAgentAnalysis({
            summary: partial.summary ?? '',
            explanations: partial.explanations ?? [],
            suggestions: partial.suggestions ?? [],
          }));
        }
      },
      controller.signal,
    ).then((analysis) => {
      if (!controller.signal.aborted) {
        dispatch(setAgentAnalysis(analysis));
      }
    }).catch((err) => {
      if (!controller.signal.aborted) {
        dispatch(setAgentError(err instanceof Error ? err.message : 'Falló el análisis'));
      }
    });

    return () => {
      controller.abort();
      dispatch(setAgentStreaming(false));
    };
  }, [target, dispatch, reduxStore]);
}
