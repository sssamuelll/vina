/**
 * verifyGarment Meta-Tool
 *
 * Read-only health check the agent MUST call after sewing/dressing, before
 * claiming success. It runs the same proactive analysis the 2D editor uses
 * (seam-length mismatch, missing seam allowance, missing grainline, dart
 * alignment, notch coverage) and returns an HONEST verdict.
 *
 * Why this exists: `runGarmentPipeline` returning `success` only means "the
 * pipeline ran" — NOT that the garment is well-formed. A pattern whose seams
 * don't match length will sew badly and fall off the avatar in 3D, yet every
 * tool returned success. Without reading the actual garment health, the agent
 * conflates pipeline-success with dressing-success and overclaims ("avatar
 * vestido ✅") while the pieces are on the floor. This tool is the signal that
 * lets the agent — and the auditable decision trail — tell the truth.
 *
 * It checks PATTERN/SEWING health (the predictor of dressing success), not the
 * live 3D drape (vertex positions are not in Redux). High seam mismatch is the
 * root cause to report; finer per-edge 3D verification is a future enhancement.
 *
 * @module verifyGarment
 */

import type { MetaToolDefinition, MetaToolResult } from './types';
import { runProactiveAnalysis } from '../../proactiveAnalysis';

export const verifyGarmentTool: MetaToolDefinition = {
  name: 'verifyGarment',
  description:
    'Read-only honest health check of the current garment: seam-length mismatches, missing seam allowance, missing grainlines, dart alignment, notch coverage. ' +
    'Call this AFTER sewing/dressing and BEFORE claiming success — `runGarmentPipeline` returning success only means it ran, not that the garment is well-formed. ' +
    'If this reports errors or mismatches, report them honestly to the user; do NOT claim the avatar is dressed. ' +
    '/ Verificación honesta del garment (desajustes de costura, margen, hilo, notches). Llámala tras coser/vestir y antes de afirmar éxito.',
  parameters: {
    type: 'object',
    properties: {},
  },
  execute: async (_params, getState): Promise<MetaToolResult> => {
    const state = getState();
    const pieces = state.project?.pieces ?? [];
    const seams = state.project?.seams ?? [];

    const warnings = runProactiveAnalysis(pieces, seams);

    const errors = warnings.filter((w) => w.severity === 'error');
    const warns = warnings.filter((w) => w.severity === 'warning');
    const infos = warnings.filter((w) => w.severity === 'info');
    const seamMismatches = warnings.filter((w) => w.category === 'seam-length');

    const verdict: 'ok' | 'has-warnings' | 'has-errors' =
      errors.length > 0 ? 'has-errors' : warns.length > 0 ? 'has-warnings' : 'ok';

    // An honest one-liner the agent can echo instead of fabricating success.
    let summary: string;
    if (pieces.length === 0) {
      summary = 'No hay piezas cargadas — no hay garment que verificar.';
    } else if (verdict === 'ok') {
      summary = `${pieces.length} piezas, ${seams.length} costuras: sin problemas detectados en el patrón.`;
    } else {
      const parts: string[] = [];
      if (seamMismatches.length > 0) parts.push(`${seamMismatches.length} costura(s) con desajuste de longitud`);
      if (errors.length > 0) parts.push(`${errors.length} error(es)`);
      if (warns.length > 0) parts.push(`${warns.length} advertencia(s)`);
      summary = `${pieces.length} piezas, ${seams.length} costuras: ${parts.join(', ')}. El garment puede no vestir/cerrar bien — repórtalo en vez de afirmar éxito.`;
    }

    return {
      success: true,
      data: {
        pieceCount: pieces.length,
        seamCount: seams.length,
        verdict,
        errorCount: errors.length,
        warningCount: warns.length,
        infoCount: infos.length,
        seamMismatchCount: seamMismatches.length,
        issues: warnings.map((w) => ({
          category: w.category,
          severity: w.severity,
          message: w.message,
          pieceIds: w.pieceIds,
        })),
        summary,
      } as unknown as Record<string, unknown>,
    };
  },
};
