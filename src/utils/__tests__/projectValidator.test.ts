/**
 * Tests for projectValidator — outline validation, cross-reference checks,
 * and graceful handling of corrupt/missing data.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateAndRepairProject } from '../projectValidator';
import type { OpenCloProject, PatternPiece, Seam, SeamGroup, PointOfMeasure, Fabric } from '../../types/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const BASE_AVATAR = {
  id: 'avatar-1',
  name: 'Default',
  modelUrl: '/models/avatar.glb',
  measurements: {
    height: 170, chest: 90, waist: 72, hips: 96,
    shoulder: 40, armLength: 60, inseam: 80,
  },
};

function makePiece(id: string, outline: PatternPiece['outline']): PatternPiece {
  return {
    id,
    name: `Piece ${id}`,
    outline,
    internals: [],
    position: { x: 0, y: 0 },
    rotation: 0,
    mirrored: false,
    seamAllowance: 10,
    active: true,
    createdAt: 1000,
    updatedAt: 1000,
  };
}

function makeValidOutline() {
  return [
    { type: 'M' as const, values: [0, 0] },
    { type: 'L' as const, values: [100, 0] },
    { type: 'L' as const, values: [100, 100] },
    { type: 'L' as const, values: [0, 100] },
    { type: 'Z' as const, values: [] },
  ];
}

function makeProject(overrides: Partial<OpenCloProject> = {}): OpenCloProject {
  return {
    id: 'proj-1',
    name: 'Test Project',
    pieces: [],
    seams: [],
    fabrics: [],
    poms: [],
    seamGroups: [],
    avatar: BASE_AVATAR,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

function makeSeam(id: string, pieceAId: string, pieceBId: string, edgeNameA = '', edgeNameB = ''): Seam {
  return {
    id,
    pieceA: { pieceId: pieceAId, edgeName: edgeNameA },
    pieceB: { pieceId: pieceBId, edgeName: edgeNameB },
    type: 'standard',
    tension: 100,
    strength: 1.0,
    active: true,
    taped: false,
    tapeWidth: 10,
  };
}

function makePOM(id: string, pieceAId: string, pieceBId: string): PointOfMeasure {
  return {
    id,
    name: `Measure ${id}`,
    category: 'length',
    method: 'straight',
    pointA: { pieceId: pieceAId, localPosition: { x: 0, y: 0 } },
    pointB: { pieceId: pieceBId, localPosition: { x: 100, y: 0 } },
    value: 100,
    createdAt: 1000,
    updatedAt: 1000,
  };
}

function makeSeamGroup(id: string, pieceAIds: string[], pieceBIds: string[]): SeamGroup {
  return {
    id,
    edgesA: pieceAIds.map((pid) => ({ pieceId: pid, edgeName: '' })),
    edgesB: pieceBIds.map((pid) => ({ pieceId: pid, edgeName: '' })),
    type: 'standard',
    tension: 100,
    strength: 1.0,
    active: true,
    taped: false,
    tapeWidth: 10,
  };
}

// Suppress console output during tests
beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('validateAndRepairProject', () => {

  // ── Valid project ───────────────────────────────────────────────────────────

  describe('valid project', () => {
    it('passes a valid project with 0 diagnostics and returns all pieces', () => {
      const piece = makePiece('p1', makeValidOutline());
      const project = makeProject({ pieces: [piece] });

      const { project: out, diagnostics, quarantine } = validateAndRepairProject(project);

      expect(diagnostics).toHaveLength(0);
      expect(out.pieces).toHaveLength(1);
      expect(out.pieces[0].id).toBe('p1');
      expect(quarantine.pieces).toHaveLength(0);
    });

    it('does not mutate the original project (deep clone)', () => {
      const outline = makeValidOutline();
      // Remove Z so validator appends it on the clone
      outline.pop();
      const piece = makePiece('p1', outline);
      const project = makeProject({ pieces: [piece] });

      validateAndRepairProject(project);

      // Original should be unchanged
      expect(project.pieces[0].outline).toHaveLength(4); // no Z appended
    });
  });

  // ── Phase 1: Outline validation ─────────────────────────────────────────────

  describe('OUTLINE_UNDEFINED', () => {
    it('removes a piece with undefined outline and quarantines it', () => {
      const piece = makePiece('p1', undefined as unknown as PatternPiece['outline']);
      const project = makeProject({ pieces: [piece] });

      const { project: out, diagnostics, quarantine } = validateAndRepairProject(project);

      expect(out.pieces).toHaveLength(0);
      expect(quarantine.pieces).toHaveLength(1);
      expect(quarantine.pieces[0].id).toBe('p1');
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].code).toBe('OUTLINE_UNDEFINED');
      expect(diagnostics[0].severity).toBe('error');
      expect(diagnostics[0].pieceId).toBe('p1');
    });

    it('removes a piece with null outline', () => {
      const piece = makePiece('p1', null as unknown as PatternPiece['outline']);
      const project = makeProject({ pieces: [piece] });

      const { project: out, diagnostics } = validateAndRepairProject(project);

      expect(out.pieces).toHaveLength(0);
      expect(diagnostics[0].code).toBe('OUTLINE_UNDEFINED');
    });

    it('removes a piece with a non-array outline value', () => {
      const piece = makePiece('p1', 'not-an-array' as unknown as PatternPiece['outline']);
      const project = makeProject({ pieces: [piece] });

      const { project: out, diagnostics } = validateAndRepairProject(project);

      expect(out.pieces).toHaveLength(0);
      expect(diagnostics[0].code).toBe('OUTLINE_UNDEFINED');
    });
  });

  describe('OUTLINE_NO_M', () => {
    it('removes a piece with an empty outline array', () => {
      const piece = makePiece('p1', []);
      const project = makeProject({ pieces: [piece] });

      const { project: out, diagnostics, quarantine } = validateAndRepairProject(project);

      expect(out.pieces).toHaveLength(0);
      expect(quarantine.pieces).toHaveLength(1);
      expect(diagnostics[0].code).toBe('OUTLINE_NO_M');
      expect(diagnostics[0].severity).toBe('error');
    });

    it('removes a piece whose outline does not start with M', () => {
      const piece = makePiece('p1', [
        { type: 'L', values: [100, 0] },
        { type: 'L', values: [100, 100] },
        { type: 'Z', values: [] },
      ]);
      const project = makeProject({ pieces: [piece] });

      const { project: out, diagnostics } = validateAndRepairProject(project);

      expect(out.pieces).toHaveLength(0);
      expect(diagnostics[0].code).toBe('OUTLINE_NO_M');
    });
  });

  describe('OUTLINE_MISSING_Z', () => {
    it('appends Z to a piece whose outline does not end with Z (warning)', () => {
      const outline = [
        { type: 'M' as const, values: [0, 0] },
        { type: 'L' as const, values: [100, 0] },
        { type: 'L' as const, values: [0, 100] },
        // No Z
      ];
      const piece = makePiece('p1', outline);
      const project = makeProject({ pieces: [piece] });

      const { project: out, diagnostics } = validateAndRepairProject(project);

      expect(out.pieces).toHaveLength(1);
      const lastCmd = out.pieces[0].outline[out.pieces[0].outline.length - 1];
      expect(lastCmd.type).toBe('Z');
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].code).toBe('OUTLINE_MISSING_Z');
      expect(diagnostics[0].severity).toBe('warning');
    });

    it('does not add a second Z if one already exists', () => {
      const piece = makePiece('p1', makeValidOutline());
      const project = makeProject({ pieces: [piece] });

      const { project: out, diagnostics } = validateAndRepairProject(project);

      const zCmds = out.pieces[0].outline.filter((c) => c.type === 'Z');
      expect(zCmds).toHaveLength(1);
      expect(diagnostics).toHaveLength(0);
    });
  });

  describe('mixed valid and invalid pieces', () => {
    it('removes only the invalid piece and keeps the valid one', () => {
      const good = makePiece('good', makeValidOutline());
      const bad = makePiece('bad', []);
      const project = makeProject({ pieces: [good, bad] });

      const { project: out, quarantine } = validateAndRepairProject(project);

      expect(out.pieces).toHaveLength(1);
      expect(out.pieces[0].id).toBe('good');
      expect(quarantine.pieces).toHaveLength(1);
      expect(quarantine.pieces[0].id).toBe('bad');
    });
  });

  // ── Phase 2: Seam cross-reference ───────────────────────────────────────────

  describe('SEAM_ORPHANED_EDGE', () => {
    it('keeps a seam when both piece IDs are valid', () => {
      const p1 = makePiece('p1', makeValidOutline());
      const p2 = makePiece('p2', makeValidOutline());
      const seam = makeSeam('s1', 'p1', 'p2');
      const project = makeProject({ pieces: [p1, p2], seams: [seam] });

      const { project: out, diagnostics } = validateAndRepairProject(project);

      expect(out.seams).toHaveLength(1);
      expect(diagnostics).toHaveLength(0);
    });

    it('removes a seam referencing a non-existent piece', () => {
      const p1 = makePiece('p1', makeValidOutline());
      const seam = makeSeam('s1', 'p1', 'missing-piece');
      const project = makeProject({ pieces: [p1], seams: [seam] });

      const { project: out, diagnostics, quarantine } = validateAndRepairProject(project);

      expect(out.seams).toHaveLength(0);
      expect(quarantine.seams).toHaveLength(1);
      expect(quarantine.seams[0].id).toBe('s1');
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].code).toBe('SEAM_ORPHANED_EDGE');
      expect(diagnostics[0].seamId).toBe('s1');
    });

    it('removes a seam whose piece was removed by outline validation (ordering test)', () => {
      // bad-piece is removed in Phase 1; seam must be cleaned up in Phase 2
      const good = makePiece('good', makeValidOutline());
      const bad = makePiece('bad', []); // will be removed
      const seam = makeSeam('s1', 'good', 'bad');
      const project = makeProject({ pieces: [good, bad], seams: [seam] });

      const { project: out, diagnostics } = validateAndRepairProject(project);

      expect(out.pieces).toHaveLength(1);
      expect(out.seams).toHaveLength(0);
      // Two diagnostics: OUTLINE_NO_M for bad + SEAM_ORPHANED_EDGE for s1
      expect(diagnostics).toHaveLength(2);
      expect(diagnostics.map((d) => d.code)).toContain('OUTLINE_NO_M');
      expect(diagnostics.map((d) => d.code)).toContain('SEAM_ORPHANED_EDGE');
    });

    it('removes a seam referencing a missing edge name when piece has edges', () => {
      const p1 = makePiece('p1', makeValidOutline());
      (p1 as PatternPiece).edges = [
        { id: 'e1', name: 'sideSeam', segmentRange: [0, 1], edgeType: 'seam' },
      ];
      const p2 = makePiece('p2', makeValidOutline());
      (p2 as PatternPiece).edges = [
        { id: 'e2', name: 'sideSeam', segmentRange: [0, 1], edgeType: 'seam' },
      ];
      // edgeNameA references a non-existent edge
      const seam = makeSeam('s1', 'p1', 'p2', 'nonexistent-edge', 'sideSeam');
      const project = makeProject({ pieces: [p1, p2], seams: [seam] });

      const { project: out, diagnostics } = validateAndRepairProject(project);

      expect(out.seams).toHaveLength(0);
      expect(diagnostics[0].code).toBe('SEAM_ORPHANED_EDGE');
    });

    it('keeps a seam with empty edge name even when piece has edges (empty = no check)', () => {
      const p1 = makePiece('p1', makeValidOutline());
      (p1 as PatternPiece).edges = [
        { id: 'e1', name: 'sideSeam', segmentRange: [0, 1], edgeType: 'seam' },
      ];
      const p2 = makePiece('p2', makeValidOutline());
      const seam = makeSeam('s1', 'p1', 'p2', '', '');
      const project = makeProject({ pieces: [p1, p2], seams: [seam] });

      const { project: out, diagnostics } = validateAndRepairProject(project);

      expect(out.seams).toHaveLength(1);
      expect(diagnostics).toHaveLength(0);
    });
  });

  // ── Phase 2: SeamGroup cross-reference ─────────────────────────────────────

  describe('SEAMGROUP_ORPHANED', () => {
    it('keeps a seamGroup when all piece IDs are valid', () => {
      const p1 = makePiece('p1', makeValidOutline());
      const p2 = makePiece('p2', makeValidOutline());
      const sg = makeSeamGroup('sg1', ['p1'], ['p2']);
      const project = makeProject({ pieces: [p1, p2], seamGroups: [sg] });

      const { project: out, diagnostics } = validateAndRepairProject(project);

      expect(out.seamGroups).toHaveLength(1);
      expect(diagnostics).toHaveLength(0);
    });

    it('removes a seamGroup referencing a missing piece', () => {
      const p1 = makePiece('p1', makeValidOutline());
      const sg = makeSeamGroup('sg1', ['p1'], ['ghost']);
      const project = makeProject({ pieces: [p1], seamGroups: [sg] });

      const { project: out, diagnostics, quarantine } = validateAndRepairProject(project);

      expect(out.seamGroups).toHaveLength(0);
      expect(quarantine.seamGroups).toHaveLength(1);
      expect(diagnostics[0].code).toBe('SEAMGROUP_ORPHANED');
    });
  });

  // ── Phase 2: Fabric ID validation ──────────────────────────────────────────

  describe('FABRIC_ID_UNKNOWN', () => {
    it('resets fabricId when it does not exist in project fabrics or built-in library', () => {
      const piece = makePiece('p1', makeValidOutline());
      piece.fabricId = 'totally-unknown-fabric';
      const project = makeProject({ pieces: [piece] });

      const { project: out, diagnostics } = validateAndRepairProject(project);

      expect(out.pieces[0].fabricId).toBeUndefined();
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].code).toBe('FABRIC_ID_UNKNOWN');
      expect(diagnostics[0].severity).toBe('warning');
    });

    it('keeps fabricId when it exists in project fabrics', () => {
      const piece = makePiece('p1', makeValidOutline());
      piece.fabricId = 'my-custom-fabric';
      const fabric: Fabric = {
        id: 'my-custom-fabric',
        name: 'My Fabric',
        color: '#fff',
        weight: 150,
        stretch: 0,
        stiffness: 0.5,
        friction: 0.3,
      };
      const project = makeProject({ pieces: [piece], fabrics: [fabric] });

      const { project: out, diagnostics } = validateAndRepairProject(project);

      expect(out.pieces[0].fabricId).toBe('my-custom-fabric');
      expect(diagnostics).toHaveLength(0);
    });

    it('keeps fabricId "cotton-poplin" from built-in library', () => {
      const piece = makePiece('p1', makeValidOutline());
      piece.fabricId = 'cotton-poplin';
      const project = makeProject({ pieces: [piece] });

      const { project: out, diagnostics } = validateAndRepairProject(project);

      // Should be kept — cotton-poplin is in PHYSICAL_FABRIC_LIBRARY
      expect(out.pieces[0].fabricId).toBe('cotton-poplin');
      expect(diagnostics).toHaveLength(0);
    });

    it('leaves pieces without fabricId unchanged', () => {
      const piece = makePiece('p1', makeValidOutline());
      // fabricId is not set
      const project = makeProject({ pieces: [piece] });

      const { project: out, diagnostics } = validateAndRepairProject(project);

      expect(out.pieces[0].fabricId).toBeUndefined();
      expect(diagnostics).toHaveLength(0);
    });
  });

  // ── Phase 2: POM cross-reference ───────────────────────────────────────────

  describe('POM_ORPHANED_PIECE', () => {
    it('keeps a POM when both piece IDs are valid', () => {
      const p1 = makePiece('p1', makeValidOutline());
      const p2 = makePiece('p2', makeValidOutline());
      const pom = makePOM('m1', 'p1', 'p2');
      const project = makeProject({ pieces: [p1, p2], poms: [pom] });

      const { project: out, diagnostics } = validateAndRepairProject(project);

      expect(out.poms).toHaveLength(1);
      expect(diagnostics).toHaveLength(0);
    });

    it('removes a POM referencing a missing piece and quarantines it', () => {
      const p1 = makePiece('p1', makeValidOutline());
      const pom = makePOM('m1', 'p1', 'ghost-piece');
      const project = makeProject({ pieces: [p1], poms: [pom] });

      const { project: out, diagnostics, quarantine } = validateAndRepairProject(project);

      expect(out.poms).toHaveLength(0);
      expect(quarantine.poms).toHaveLength(1);
      expect(quarantine.poms[0].id).toBe('m1');
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].code).toBe('POM_ORPHANED_PIECE');
      expect(diagnostics[0].severity).toBe('error');
    });

    it('removes a POM when pointA references a missing piece', () => {
      const p2 = makePiece('p2', makeValidOutline());
      const pom = makePOM('m1', 'ghost-piece', 'p2');
      const project = makeProject({ pieces: [p2], poms: [pom] });

      const { project: out, diagnostics } = validateAndRepairProject(project);

      expect(out.poms).toHaveLength(0);
      expect(diagnostics[0].code).toBe('POM_ORPHANED_PIECE');
    });
  });

  // ── Undefined / missing array guards ───────────────────────────────────────

  describe('undefined array guards', () => {
    it('handles project with undefined pieces array gracefully', () => {
      const project = makeProject();
      // Force undefined at runtime
      (project as unknown as Record<string, unknown>).pieces = undefined;

      const { project: out, diagnostics } = validateAndRepairProject(project);

      expect(out.pieces).toEqual([]);
      expect(diagnostics).toHaveLength(0);
    });

    it('handles project with undefined seams array gracefully', () => {
      const project = makeProject();
      (project as unknown as Record<string, unknown>).seams = undefined;

      const { project: out, diagnostics } = validateAndRepairProject(project);

      expect(out.seams).toEqual([]);
      expect(diagnostics).toHaveLength(0);
    });

    it('handles project with undefined poms array gracefully', () => {
      const project = makeProject();
      (project as unknown as Record<string, unknown>).poms = undefined;

      const { project: out, diagnostics } = validateAndRepairProject(project);

      expect(out.poms).toEqual([]);
      expect(diagnostics).toHaveLength(0);
    });

    it('handles project with undefined seamGroups array gracefully', () => {
      const project = makeProject();
      (project as unknown as Record<string, unknown>).seamGroups = undefined;

      const { project: out, diagnostics } = validateAndRepairProject(project);

      expect(out.seamGroups).toEqual([]);
      expect(diagnostics).toHaveLength(0);
    });
  });

  // ── Empty project ───────────────────────────────────────────────────────────

  describe('empty project', () => {
    it('passes an empty project (no pieces, no seams) with 0 diagnostics', () => {
      const project = makeProject();

      const { project: out, diagnostics, quarantine } = validateAndRepairProject(project);

      expect(diagnostics).toHaveLength(0);
      expect(out.pieces).toHaveLength(0);
      expect(out.seams).toHaveLength(0);
      expect(quarantine.pieces).toHaveLength(0);
      expect(quarantine.seams).toHaveLength(0);
    });
  });

  // ── Console output ──────────────────────────────────────────────────────────

  describe('console logging', () => {
    it('calls console.error for error-severity diagnostics', () => {
      const piece = makePiece('p1', []);
      const project = makeProject({ pieces: [piece] });

      validateAndRepairProject(project);

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('[projectValidator]'),
      );
    });

    it('calls console.warn for warning-severity diagnostics', () => {
      const outline = [
        { type: 'M' as const, values: [0, 0] },
        { type: 'L' as const, values: [100, 0] },
      ];
      const piece = makePiece('p1', outline);
      const project = makeProject({ pieces: [piece] });

      validateAndRepairProject(project);

      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('[projectValidator]'),
      );
    });
  });
});
