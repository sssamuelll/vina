/**
 * Project Validator — runtime validation and repair for OpenCloProject data.
 *
 * Validates structural invariants and cross-references within a project,
 * producing diagnostics and quarantining corrupt entities while preserving
 * all valid data.
 *
 * Phase 1: Outline validation (may remove pieces from the project)
 * Phase 2: Cross-reference validation (against the cleaned piece list)
 *
 * @module projectValidator
 */

import type { OpenCloProject, PatternPiece, Seam, SeamGroup, PointOfMeasure } from '../types/types';
import { PHYSICAL_FABRIC_LIBRARY } from './cloth/physicalFabric';
import { getEdgeEndpoints } from './geometry/path';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ValidationCode =
  | 'OUTLINE_NO_M'
  | 'OUTLINE_MISSING_Z'
  | 'OUTLINE_UNDEFINED'
  | 'SEAM_ORPHANED_EDGE'
  | 'SEAMGROUP_ORPHANED'
  | 'FABRIC_ID_UNKNOWN'
  | 'POM_ORPHANED_PIECE';

export interface ValidationDiagnostic {
  severity: 'error' | 'warning' | 'info';
  code: ValidationCode;
  message: string;
  pieceId?: string;
  seamId?: string;
  field?: string;
}

export interface Quarantine {
  pieces: PatternPiece[];
  seams: Seam[];
  poms: PointOfMeasure[];
  seamGroups: SeamGroup[];
}

export interface ValidationResult {
  project: OpenCloProject;
  diagnostics: ValidationDiagnostic[];
  quarantine: Quarantine;
}

// ─── Built-in fabric ID lookup ────────────────────────────────────────────────

const BUILT_IN_FABRIC_IDS: Set<string> = (() => {
  try {
    return new Set(PHYSICAL_FABRIC_LIBRARY.map((f) => f.id));
  } catch {
    return new Set<string>();
  }
})();

function isValidEdgeReference(piece: PatternPiece, edgeName: string): boolean {
  if (!edgeName) return true;

  const hasSemanticEdges = Array.isArray(piece.edges) && piece.edges.length > 0;
  if (!hasSemanticEdges) return true;

  const semanticEdges = new Set(piece.edges!.map((e) => e.name));
  if (semanticEdges.has(edgeName)) return true;

  const fallbackMatch = edgeName.match(/^edge-(\d+)$/);
  if (!fallbackMatch) return false;

  const fallbackIndex = Number.parseInt(fallbackMatch[1], 10);
  const commandIndex = fallbackIndex + 1;
  return getEdgeEndpoints(piece.outline, commandIndex) !== null;
}

// ─── Main validator ──────────────────────────────────────────────────────────

/**
 * Validate and repair a project in-place (on a deep clone).
 *
 * Returns the cleaned project, a list of diagnostics, and a quarantine
 * containing all removed entities for inspection or recovery.
 */
export function validateAndRepairProject(project: OpenCloProject): ValidationResult {
  // Deep clone so we never mutate caller's state
  const p: OpenCloProject = JSON.parse(JSON.stringify(project));

  const diagnostics: ValidationDiagnostic[] = [];
  const quarantine: Quarantine = { pieces: [], seams: [], poms: [], seamGroups: [] };

  // Guard undefined arrays
  if (!Array.isArray(p.pieces)) p.pieces = [];
  if (!Array.isArray(p.seams)) p.seams = [];
  if (!Array.isArray(p.poms)) p.poms = [];
  if (!Array.isArray(p.seamGroups)) p.seamGroups = [];

  // ─── Phase 1: Outline validation ─────────────────────────────────────────

  const cleanPieces: PatternPiece[] = [];

  for (const piece of p.pieces) {
    // Rule 1a: outline must be a defined array
    if (piece.outline === undefined || piece.outline === null || !Array.isArray(piece.outline)) {
      const diag: ValidationDiagnostic = {
        severity: 'error',
        code: 'OUTLINE_UNDEFINED',
        message: `Piece "${piece.id}" has an undefined or non-array outline and was removed.`,
        pieceId: piece.id,
        field: 'outline',
      };
      diagnostics.push(diag);
      console.error(`[projectValidator] ${diag.code}: ${diag.message}`);
      quarantine.pieces.push(piece);
      continue;
    }

    // Rule 1b: outline must be non-empty and start with an M command
    if (piece.outline.length === 0 || piece.outline[0].type !== 'M') {
      const diag: ValidationDiagnostic = {
        severity: 'error',
        code: 'OUTLINE_NO_M',
        message: `Piece "${piece.id}" has an outline that is empty or does not start with M and was removed.`,
        pieceId: piece.id,
        field: 'outline',
      };
      diagnostics.push(diag);
      console.error(`[projectValidator] ${diag.code}: ${diag.message}`);
      quarantine.pieces.push(piece);
      continue;
    }

    // Rule 1c: outline must end with Z — append if missing (warning, piece kept)
    const lastCmd = piece.outline[piece.outline.length - 1];
    if (lastCmd.type !== 'Z') {
      piece.outline.push({ type: 'Z', values: [] });
      const diag: ValidationDiagnostic = {
        severity: 'warning',
        code: 'OUTLINE_MISSING_Z',
        message: `Piece "${piece.id}" outline was missing closing Z command — appended automatically.`,
        pieceId: piece.id,
        field: 'outline',
      };
      diagnostics.push(diag);
      console.warn(`[projectValidator] ${diag.code}: ${diag.message}`);
    }

    cleanPieces.push(piece);
  }

  p.pieces = cleanPieces;

  // ─── Phase 2: Cross-reference validation ─────────────────────────────────

  const pieceIds = new Set(p.pieces.map((piece) => piece.id));

  // Built-in fabric IDs from physicalFabric library
  const builtInFabricIds = BUILT_IN_FABRIC_IDS;
  // Build project-level fabric ID set
  const projectFabricIds = new Set((p.fabrics ?? []).map((f) => f.id));

  // ── Seam cross-reference ──────────────────────────────────────────────────

  const cleanSeams: Seam[] = [];

  for (const seam of p.seams) {
    let orphaned = false;
    let reason = '';

    // Check pieceId existence for both sides
    if (!pieceIds.has(seam.pieceA.pieceId)) {
      orphaned = true;
      reason = `pieceA.pieceId "${seam.pieceA.pieceId}" not found in pieces`;
    } else if (!pieceIds.has(seam.pieceB.pieceId)) {
      orphaned = true;
      reason = `pieceB.pieceId "${seam.pieceB.pieceId}" not found in pieces`;
    } else {
      const pieceA = p.pieces.find((piece) => piece.id === seam.pieceA.pieceId)!;
      const pieceB = p.pieces.find((piece) => piece.id === seam.pieceB.pieceId)!;

      if (!isValidEdgeReference(pieceA, seam.pieceA.edgeName)) {
        orphaned = true;
        reason = `pieceA.edgeName "${seam.pieceA.edgeName}" is not a valid semantic edge or edge-N fallback for piece "${seam.pieceA.pieceId}"`;
      } else if (!isValidEdgeReference(pieceB, seam.pieceB.edgeName)) {
        orphaned = true;
        reason = `pieceB.edgeName "${seam.pieceB.edgeName}" is not a valid semantic edge or edge-N fallback for piece "${seam.pieceB.pieceId}"`;
      }
    }

    if (orphaned) {
      const diag: ValidationDiagnostic = {
        severity: 'error',
        code: 'SEAM_ORPHANED_EDGE',
        message: `Seam "${seam.id}" references a missing piece or edge (${reason}) and was removed.`,
        seamId: seam.id,
      };
      diagnostics.push(diag);
      console.error(`[projectValidator] ${diag.code}: ${diag.message}`);
      quarantine.seams.push(seam);
      continue;
    }

    cleanSeams.push(seam);
  }

  p.seams = cleanSeams;

  // ── SeamGroup cross-reference ─────────────────────────────────────────────

  const cleanSeamGroups: SeamGroup[] = [];

  for (const sg of p.seamGroups as SeamGroup[]) {
    const allEdges = [...(sg.edgesA ?? []), ...(sg.edgesB ?? [])];
    const orphanedRef = allEdges.find((e) => !pieceIds.has(e.pieceId));

    if (orphanedRef) {
      const diag: ValidationDiagnostic = {
        severity: 'error',
        code: 'SEAMGROUP_ORPHANED',
        message: `SeamGroup "${sg.id}" references missing pieceId "${orphanedRef.pieceId}" and was removed.`,
      };
      diagnostics.push(diag);
      console.error(`[projectValidator] ${diag.code}: ${diag.message}`);
      quarantine.seamGroups.push(sg);
      continue;
    }

    cleanSeamGroups.push(sg);
  }

  p.seamGroups = cleanSeamGroups;

  // ── Fabric ID validation ──────────────────────────────────────────────────

  for (const piece of p.pieces) {
    if (piece.fabricId === undefined || piece.fabricId === null) continue;

    const inProject = projectFabricIds.has(piece.fabricId);
    const inLibrary = builtInFabricIds.has(piece.fabricId);

    if (!inProject && !inLibrary) {
      const diag: ValidationDiagnostic = {
        severity: 'warning',
        code: 'FABRIC_ID_UNKNOWN',
        message: `Piece "${piece.id}" references unknown fabricId "${piece.fabricId}" — reset to undefined.`,
        pieceId: piece.id,
        field: 'fabricId',
      };
      diagnostics.push(diag);
      console.warn(`[projectValidator] ${diag.code}: ${diag.message}`);
      piece.fabricId = undefined;
    }
  }

  // ── POM cross-reference ───────────────────────────────────────────────────

  const cleanPoms: PointOfMeasure[] = [];

  for (const pom of p.poms as PointOfMeasure[]) {
    let orphaned = false;
    let reason = '';

    if (!pieceIds.has(pom.pointA.pieceId)) {
      orphaned = true;
      reason = `pointA.pieceId "${pom.pointA.pieceId}" not found`;
    } else if (!pieceIds.has(pom.pointB.pieceId)) {
      orphaned = true;
      reason = `pointB.pieceId "${pom.pointB.pieceId}" not found`;
    }

    if (orphaned) {
      const diag: ValidationDiagnostic = {
        severity: 'error',
        code: 'POM_ORPHANED_PIECE',
        message: `POM "${pom.id}" references a missing piece (${reason}) and was removed.`,
        pieceId: orphaned ? (pom.pointA.pieceId ?? pom.pointB.pieceId) : undefined,
      };
      diagnostics.push(diag);
      console.error(`[projectValidator] ${diag.code}: ${diag.message}`);
      quarantine.poms.push(pom);
      continue;
    }

    cleanPoms.push(pom);
  }

  p.poms = cleanPoms;

  return { project: p, diagnostics, quarantine };
}
