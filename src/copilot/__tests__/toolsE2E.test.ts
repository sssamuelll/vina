/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * E2E Tool Tests — exercises the full pipeline:
 * Registry → Tool lookup → Execute with real Redux store → Verify state changes.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import projectReducer from '../../store/projectSlice';
import editorReducer from '../../store/editorSlice';
import simulationReducer from '../../store/simulationSlice';
import pluginReducer from '../../store/pluginSlice';
import layoutReducer from '../../store/layoutSlice';
import markerReducer from '../../store/markerSlice';
import avatarReducer from '../../store/avatarSlice';
import toolReducer from '../../store/toolSlice';
import parametricReducer from '../../store/parametricSlice';
import { getDefaultRegistry, resetDefaultRegistry, type ToolDefinition } from '../action/tools/registry';
import type { RootState, AppDispatch } from '../../store';

// ─── Test Store Factory ─────────────────────────────────────────────────────

function createTestStore() {
  return configureStore({
    reducer: {
      project: projectReducer,
      editor: editorReducer,
      simulation: simulationReducer,
      plugins: pluginReducer,
      layout: layoutReducer,
      marker: markerReducer,
      avatar: avatarReducer,
      tools: toolReducer,
      parametric: parametricReducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });
}

type TestStore = ReturnType<typeof createTestStore>;

async function executeTool(
  store: TestStore,
  tool: ToolDefinition,
  params: Record<string, unknown>,
) {
  const dispatch = store.dispatch as AppDispatch;
  const getState = store.getState as () => RootState;
  return tool.execute(params, dispatch, getState);
}

// Simple rectangle outline for test pieces
const RECT_OUTLINE = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [200, 0] },
  { type: 'L', values: [200, 300] },
  { type: 'L', values: [0, 300] },
  { type: 'Z', values: [] },
];

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Tools E2E', () => {
  let registry: ReturnType<typeof getDefaultRegistry>;
  let store: TestStore;

  beforeEach(() => {
    resetDefaultRegistry();
    registry = getDefaultRegistry();
    store = createTestStore();
  });

  // ─── Registry health ───────────────────────────────────────────────

  describe('Registry', () => {
    it('has 205 tools registered', () => {
      expect(registry.size).toBe(205); // 204 + 1 mesh selection tool
    });

    it('every tool has name, description, parameters, execute', () => {
      const tools = registry.list();
      for (const tool of tools) {
        expect(tool.name).toBeTruthy();
        expect(tool.description.length).toBeGreaterThan(10);
        expect(tool.parameters).toBeDefined();
        expect(typeof tool.execute).toBe('function');
      }
    });

    it('no duplicate tool names', () => {
      const names = registry.list().map(t => t.name);
      expect(new Set(names).size).toBe(names.length);
    });

    it('most tool descriptions are bilingual (EN/ES)', () => {
      const tools = registry.list();
      const bilingual = tools.filter(t => t.description.includes('/'));
      // At least 60% should have bilingual descriptions
      expect(bilingual.length).toBeGreaterThan(tools.length * 0.6);
    });
  });

  // ─── Piece Tools ──────────────────────────────────────────────────

  describe('Piece Tools', () => {
    it('createPiece with outline adds a piece', async () => {
      const tool = registry.get('createPiece')!;
      expect(tool).toBeDefined();

      const result = await executeTool(store, tool, {
        name: 'Front Bodice',
        outline: RECT_OUTLINE,
      });

      expect(result.success).toBe(true);
      expect(store.getState().project.pieces).toHaveLength(1);
      expect(store.getState().project.pieces[0].name).toBe('Front Bodice');
    });

    it('createPiece with outline generates piece', async () => {
      const tool = registry.get('createPiece')!;
      const result = await executeTool(store, tool, {
        name: 'Test Piece',
        outline: RECT_OUTLINE,
      });
      expect(result.success).toBe(true);
      expect(store.getState().project.pieces.length).toBeGreaterThanOrEqual(1);
    });

    it('mirrorPiece mirrors a piece in place', async () => {
      const create = registry.get('createPiece')!;
      await executeTool(store, create, { name: 'Original', outline: RECT_OUTLINE });
      const pieceId = store.getState().project.pieces[0].id;

      const mirror = registry.get('mirrorPiece')!;
      expect(mirror).toBeDefined();
      const result = await executeTool(store, mirror, { pieceId });

      expect(result.success).toBe(true);
      // Mirror flips in place, piece count stays the same
      expect(store.getState().project.pieces).toHaveLength(1);
    });

    it('deletePiece removes a piece', async () => {
      const create = registry.get('createPiece')!;
      await executeTool(store, create, { name: 'ToDelete', outline: RECT_OUTLINE });
      const pieceId = store.getState().project.pieces[0].id;

      const del = registry.get('deletePiece')!;
      const result = await executeTool(store, del, { pieceId });

      expect(result.success).toBe(true);
      expect(store.getState().project.pieces).toHaveLength(0);
    });
  });

  // ─── Seam Tools ───────────────────────────────────────────────────

  describe('Seam Tools', () => {
    it('createSeam connects two pieces', async () => {
      const create = registry.get('createPiece')!;
      await executeTool(store, create, { name: 'Piece A', outline: RECT_OUTLINE });
      await executeTool(store, create, { name: 'Piece B', outline: RECT_OUTLINE });

      // Detect edges on both pieces so createSeam can validate edge names
      const detectEdges = registry.get('detectEdges')!;
      const pieces = store.getState().project.pieces;
      await executeTool(store, detectEdges, { pieceId: pieces[0].id });
      await executeTool(store, detectEdges, { pieceId: pieces[1].id });

      // Re-fetch pieces after edge detection
      const updatedPieces = store.getState().project.pieces;
      const edgeNameA = updatedPieces[0].edges?.[0]?.name;
      const edgeNameB = updatedPieces[1].edges?.[0]?.name;
      expect(edgeNameA).toBeTruthy();
      expect(edgeNameB).toBeTruthy();

      const seamTool = registry.get('createSeam')!;
      const result = await executeTool(store, seamTool, {
        pieceAId: updatedPieces[0].id,
        edgeAName: edgeNameA,
        pieceBId: updatedPieces[1].id,
        edgeBName: edgeNameB,
      });

      expect(result.success).toBe(true);
      expect(store.getState().project.seams).toHaveLength(1);
    });
  });

  // ─── Editor Tools ─────────────────────────────────────────────────

  describe('Editor Tools', () => {
    it('setViewMode changes the view', async () => {
      const tool = registry.get('setViewMode')!;
      expect(tool).toBeDefined();
      const result = await executeTool(store, tool, { mode: '3d' });
      expect(result.success).toBe(true);
    });

    it('select/deselect tools exist', () => {
      // Check what editor tools are actually available
      const editorTools = registry.list().filter(t =>
        t.name.includes('select') || t.name.includes('view') || t.name.includes('zoom')
      );
      expect(editorTools.length).toBeGreaterThan(0);
    });
  });

  // ─── Export Tools ─────────────────────────────────────────────────

  describe('Export Tools', () => {
    it('exportDXF handles no pieces gracefully', async () => {
      const tool = registry.get('exportDXF')!;
      expect(tool).toBeDefined();
      const result = await executeTool(store, tool, {});
      expect(result).toBeDefined();
    });

    it('exportPDF handles no pieces gracefully', async () => {
      const tool = registry.get('exportPDF')!;
      expect(tool).toBeDefined();
      const result = await executeTool(store, tool, {});
      expect(result).toBeDefined();
    });
  });

  // ─── Measurement Tools ────────────────────────────────────────────

  describe('Measurement Tools', () => {
    it('setMeasurements updates avatar', async () => {
      const tool = registry.get('setMeasurements')!;
      expect(tool).toBeDefined();

      const result = await executeTool(store, tool, {
        measurements: {
          height: 175,
          chest: 96,
          waist: 80,
          hips: 102,
        },
      });

      expect(result.success).toBe(true);
    });

    it('setMeasurementsFromSize exists', () => {
      const tool = registry.get('setMeasurementsFromSize');
      expect(tool).toBeDefined();
    });
  });

  // ─── Auto-Sew Tools ──────────────────────────────────────────────

  describe('Auto-Sew Tools', () => {
    it('autoDetectSeams works on multiple pieces', async () => {
      // Create pieces first
      const create = registry.get('createPiece')!;
      await executeTool(store, create, { name: 'Front', outline: RECT_OUTLINE });
      await executeTool(store, create, { name: 'Back', outline: RECT_OUTLINE });

      expect(store.getState().project.pieces).toHaveLength(2);

      const tool = registry.get('autoDetectSeams')!;
      const result = await executeTool(store, tool, {});
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('autoDetectSeams fails with fewer than 2 pieces', async () => {
      const tool = registry.get('autoDetectSeams')!;
      const result = await executeTool(store, tool, {});
      expect(result.success).toBe(false);
    });
  });

  // ─── Fabric Tools ────────────────────────────────────────────────

  describe('Fabric Tools', () => {
    it('searchFabrics returns results', async () => {
      const tool = registry.get('searchFabrics')!;
      const result = await executeTool(store, tool, { query: 'cotton' });
      expect(result.success).toBe(true);
      expect((result.data as any).results.length).toBeGreaterThan(0);
    });

    it('getFabricDetails returns fabric info', async () => {
      const tool = registry.get('getFabricDetails')!;
      const result = await executeTool(store, tool, { fabricId: 'cotton-poplin' });
      expect(result.success).toBe(true);
      expect(result.data!.name).toBeTruthy();
    });

    it('getFabricDetails fails for unknown fabric', async () => {
      const tool = registry.get('getFabricDetails')!;
      const result = await executeTool(store, tool, { fabricId: 'unicorn-silk' });
      expect(result.success).toBe(false);
    });

    it('compareFabrics compares an array of fabrics', async () => {
      const tool = registry.get('compareFabrics')!;
      const result = await executeTool(store, tool, {
        fabricIds: ['cotton-poplin', 'denim-12oz'],
      });
      expect(result.success).toBe(true);
    });
  });

  // ─── Template Tools (removed — replaced by seamlyTools) ─────────

  // ─── Semantic Fit Tools ───────────────────────────────────────────

  describe('Semantic Fit Tools', () => {
    it('all 4 semantic tools fail gracefully without template', async () => {
      const tools = ['adjustFit', 'adjustLength', 'adjustSleeve', 'adjustProportions'];
      for (const name of tools) {
        const tool = registry.get(name)!;
        expect(tool).toBeDefined();
        const result = await executeTool(store, tool, {
          region: 'bust', direction: 'looser', amount: 10,
          property: 'length', ratio: 'shoulder_to_waist', shift: 10,
        });
        expect(result.success).toBe(false);
        expect(result.error).toContain('No template loaded');
      }
    });

    it('adjustFit works with active template', async () => {
      store.dispatch({
        type: 'parametric/activateTemplate',
        payload: {
          pattern: {
            name: 'test_bodice',
            variables: {
              '#BustEase': { formula: '40', description: 'bust ease' },
              '#WaistWidth': { formula: '740', description: 'waist width' },
            },
            construction: [],
          },
          measurements: { height: 1680, chest: 920, waist: 740, hips: 980, shoulder: 128, armLength: 595, inseam: 780 },
          size: 'M',
          sizeSystem: 'eu-women',
          resolvedVariables: { '#BustEase': 40, '#WaistWidth': 740 },
          pieceIds: [],
        },
      });

      const tool = registry.get('adjustFit')!;
      const result = await executeTool(store, tool, {
        region: 'bust', direction: 'looser', amount: 10,
      });

      expect(result.success).toBe(true);
      expect((result.data as any).adjustments.length).toBeGreaterThan(0);
      expect(Object.keys(store.getState().parametric.variableOverrides).length).toBeGreaterThan(0);
    });

    it('adjustLength works with active template', async () => {
      store.dispatch({
        type: 'parametric/activateTemplate',
        payload: {
          pattern: {
            name: 'test_dress',
            variables: {
              '#SleeveLength': { formula: '595', description: 'sleeve length' },
              '#HemlineLength': { formula: '650', description: 'hemline length' },
            },
            construction: [],
          },
          measurements: { height: 1680, chest: 920, waist: 740, hips: 980, shoulder: 128, armLength: 595, inseam: 780 },
          size: 'M',
          sizeSystem: 'eu-women',
          resolvedVariables: { '#SleeveLength': 595, '#HemlineLength': 650 },
          pieceIds: [],
        },
      });

      const tool = registry.get('adjustLength')!;
      const result = await executeTool(store, tool, {
        region: 'sleeve', direction: 'shorter', amount: 20,
      });

      expect(result.success).toBe(true);
      const overrides = store.getState().parametric.variableOverrides;
      expect(overrides['#SleeveLength']).toBe(575); // 595 - 20
    });
  });

  // ─── Error Handling ───────────────────────────────────────────────

  describe('Error Handling', () => {
    it('deletePiece with non-existent ID fails gracefully', async () => {
      const tool = registry.get('deletePiece')!;
      const result = await executeTool(store, tool, { pieceId: 'non-existent-id' });
      expect(result.success).toBe(false);
    });

    it('createSeam with invalid piece IDs fails', async () => {
      const tool = registry.get('createSeam')!;
      const result = await executeTool(store, tool, {
        pieceAId: 'fake-a', edgeA: 0, pieceBId: 'fake-b', edgeB: 0,
      });
      expect(result.success).toBe(false);
    });
  });

  // ─── Coverage Summary ─────────────────────────────────────────────

  describe('Coverage', () => {
    it('all tool names present', () => {
      const names = registry.list().map(t => t.name).sort();
      expect(names.length).toBe(205); // 204 + 1 mesh selection tool

      // Key tools from every category
      const expected = [
        'createPiece', 'deletePiece', 'mirrorPiece',
        'createSeam',
        'setViewMode',
        'exportDXF', 'exportPDF', 'export3DOBJ', 'export3DGLTF',
        'exportBOM', 'exportMultiSizeDXF', 'export3DFBX', 'exportOBJSequence',
        'setMeasurements',
        'autoDetectSeams',
        'searchFabrics', 'getFabricDetails', 'compareFabrics',
        'listSeamlyPatterns', 'loadSeamlyPattern',
        'adjustFit', 'adjustLength', 'adjustSleeve', 'adjustProportions',
        'runGarmentPipeline',
        'modifyDimension',
        'setLayer', 'cloneToLayer', 'superimpose', 'getLayerInfo',
        'createPOM', 'getPOMs', 'updatePOM', 'removePOM',
      ];
      for (const name of expected) {
        expect(names).toContain(name);
      }
    });
  });
});
