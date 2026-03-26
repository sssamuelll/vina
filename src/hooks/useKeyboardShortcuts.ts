/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * useKeyboardShortcuts — CLO3D-compatible global keyboard shortcut system.
 *
 * Registers all shortcut handlers with the centralized ShortcutRegistry.
 * The actual keydown listener is in ShortcutProvider — this hook only
 * registers/unregisters handlers as state changes.
 *
 * @see GitHub issue #124, #12
 */

import { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../store';
import {
  setActiveTool,
  clearSelection,
  selectAllVisiblePieces,
  toggleSeamAllowance,
  undo,
  redo,
  copyPieces,
  createPastedPieces,
} from '../store/editorSlice';
import { setActiveTool2D, setActiveTool3D } from '../store/toolSlice';
import { removePieces, removeSeam, reverseSeam, addPiece, duplicatePiece, flipPieceH } from '../store/projectSlice';
import {
  startSimulation,
  resetSimulation,
  setViewMode3D,
  setSimulationMode,
  setParticleDistance,
  saveArrangementSnapshot,
  clearArrangementSnapshot,
  setFitMapMode,
  setXrayMode,
} from '../store/simulationSlice';
import { placeGarmentPieces } from '../utils/cloth/garmentPlacement';
import { saveToLocalStorage } from '../utils/projectIO';
import { useShortcutRegistry } from '../shortcuts/useShortcut';

// Re-export ShortcutEntry type for backwards compatibility
export type { ShortcutDef as ShortcutEntry } from '../shortcuts/ShortcutRegistry';

import { DEFAULT_SHORTCUTS } from '../shortcuts/defaults';

/** Exportable shortcut map for help overlay — now reads from registry */
export function getShortcutMap() {
  return DEFAULT_SHORTCUTS;
}

export function useKeyboardShortcuts() {
  const dispatch = useDispatch();
  const registry = useShortcutRegistry();
  const pieces = useSelector((s: RootState) => s.project.pieces);
  const selectedPieceIds = useSelector((s: RootState) => s.editor.selectedPieceIds);
  const selectedSeamId = useSelector((s: RootState) => s.editor.selectedSeamId);
  const viewMode3D = useSelector((s: RootState) => s.simulation.viewMode3D);
  const fitMapMode = useSelector((s: RootState) => s.simulation.fitMapMode);
  const avatar = useSelector((s: RootState) => s.project.avatar);
  const projectState = useSelector((s: RootState) => s.project);
  const clipboard = useSelector((s: RootState) => s.editor.clipboard);
  const xrayMode = useSelector((s: RootState) => s.simulation.xrayMode);
  const layerLocked = useSelector((s: RootState) => s.project.layerLocked);

  useEffect(() => {
    if (!registry) return;

    // ─── Utilities ──────────────────────────────────────────────────────

    const canFireShortcut = () => {
      const el = document.activeElement;
      if (!el) return true;
      const tagName = el.tagName.toLowerCase();
      const isInput = tagName === 'input' || tagName === 'textarea';
      const isContentEditable = (el as HTMLElement).contentEditable === 'true';
      return !isInput && !isContentEditable;
    };

    const wrapHandler = (handler: () => void) => () => {
      if (canFireShortcut()) handler();
    };

    // ─── Define all handlers ────────────────────────────────────────────

    const handlers: Array<[string, () => void]> = [
      // File
      ['file.save', wrapHandler(() => saveToLocalStorage(projectState))],

      // Edit
      ['edit.undo', wrapHandler(() => dispatch(undo()))],
      ['edit.redo', wrapHandler(() => dispatch(redo()))],
      ['edit.redoAlt', wrapHandler(() => dispatch(redo()))],
      ['edit.copy', wrapHandler(() => {
        if (selectedPieceIds.length > 0) {
          const selectedPieces = pieces.filter(p => selectedPieceIds.includes(p.id));
          if (selectedPieces.length > 0) dispatch(copyPieces({ pieces: selectedPieces }));
        }
      })],
      ['edit.paste', wrapHandler(() => {
        if (clipboard) {
          const newPieces = createPastedPieces(clipboard);
          for (const p of newPieces) dispatch(addPiece(p));
        }
      })],
      ['edit.mirrorPaste', wrapHandler(() => {
        if (clipboard) {
          const newPieces = createPastedPieces(clipboard, true);
          for (const p of newPieces) {
            dispatch(addPiece(p));
            dispatch(flipPieceH(p.id));
          }
        }
      })],
      ['edit.duplicate', wrapHandler(() => {
        for (const id of selectedPieceIds) dispatch(duplicatePiece(id));
      })],
      ['edit.delete', wrapHandler(() => {
        if (selectedPieceIds.length > 0) {
          dispatch(removePieces(selectedPieceIds));
        } else if (selectedSeamId) {
          dispatch(removeSeam(selectedSeamId));
        }
      })],
      ['edit.deleteAlt', wrapHandler(() => {
        if (selectedPieceIds.length > 0) {
          dispatch(removePieces(selectedPieceIds));
        } else if (selectedSeamId) {
          dispatch(removeSeam(selectedSeamId));
        }
      })],

      // Selection
      ['selection.selectAll', wrapHandler(() => dispatch(selectAllVisiblePieces({ pieces, layerLocked })))],
      ['selection.deselect', wrapHandler(() => dispatch(clearSelection()))],
      ['selection.reverseSeam', wrapHandler(() => { if (selectedSeamId) dispatch(reverseSeam(selectedSeamId)); })],

      // Simulation
      ['sim.hiRes', () => {
        if (viewMode3D === 'arrange') {
          dispatch(setSimulationMode('complete'));
          dispatch(setParticleDistance(3));
          const placements = placeGarmentPieces(pieces, avatar.measurements);
          const snapshot: Record<string, [number, number, number]> = {};
          pieces.forEach((p, i) => {
            const pos = placements[i].position;
            snapshot[p.id] = [pos[0], pos[1], pos[2]];
          });
          dispatch(saveArrangementSnapshot(snapshot));
          dispatch(setViewMode3D('simulate'));
          dispatch(startSimulation());
        }
      }],
      ['sim.toggle', () => {
        if (viewMode3D === 'arrange') {
          const placements = placeGarmentPieces(pieces, avatar.measurements);
          const snapshot: Record<string, [number, number, number]> = {};
          pieces.forEach((p, i) => {
            const pos = placements[i].position;
            snapshot[p.id] = [pos[0], pos[1], pos[2]];
          });
          dispatch(saveArrangementSnapshot(snapshot));
          dispatch(setViewMode3D('simulate'));
          dispatch(startSimulation());
        } else {
          dispatch(resetSimulation());
          dispatch(setViewMode3D('arrange'));
        }
      }],
      ['sim.reset', () => {
        dispatch(resetSimulation());
        dispatch(setViewMode3D('arrange'));
        dispatch(clearArrangementSnapshot());
      }],

      // View
      ['view.toggleSeamAllowance', () => dispatch(toggleSeamAllowance())],
      ['view.layersPanel', () => window.dispatchEvent(new CustomEvent('openclo:toggleLayersPanel'))],
      ['view.xrayMode', () => dispatch(setXrayMode({ enabled: !xrayMode }))],

      // 2D Tools (CLO3D mapping)
      ['tool.transform', () => { dispatch(setActiveTool('transform' as any)); dispatch(setActiveTool2D('transform')); }],
      ['tool.select', () => { dispatch(setActiveTool('select' as any)); dispatch(setActiveTool2D('select')); }],
      ['tool.editCurve', () => { dispatch(setActiveTool('editCurve' as any)); dispatch(setActiveTool2D('editCurve')); }],
      ['tool.editConstrain', () => { dispatch(setActiveTool('editConstrain' as any)); dispatch(setActiveTool2D('editConstrain')); }],
      ['tool.pen', () => { dispatch(setActiveTool('pen' as any)); dispatch(setActiveTool2D('pen')); }],
      ['tool.rectangle', () => { dispatch(setActiveTool('rectangle' as any)); dispatch(setActiveTool2D('rectangle')); }],
      ['tool.circle', () => { dispatch(setActiveTool('circle' as any)); dispatch(setActiveTool2D('circle')); }],
      ['tool.internalShape', () => { dispatch(setActiveTool('internalShape' as any)); dispatch(setActiveTool2D('internalShape')); }],
      ['tool.trace', () => { dispatch(setActiveTool('trace' as any)); dispatch(setActiveTool2D('trace')); }],
      ['tool.dart', () => { dispatch(setActiveTool('dart' as any)); dispatch(setActiveTool2D('dart')); }],
      ['tool.scissors', () => { dispatch(setActiveTool('scissors' as any)); dispatch(setActiveTool2D('scissors')); }],
      ['tool.pin', () => { dispatch(setActiveTool('pin' as any)); dispatch(setActiveTool2D('pin')); }],
      ['tool.measure', () => { dispatch(setActiveTool('measure' as any)); dispatch(setActiveTool2D('measure')); }],
      ['tool.walkSeam', () => { dispatch(setActiveTool('walkSeam' as any)); dispatch(setActiveTool2D('walkSeam')); }],
      ['tool.merge', () => { dispatch(setActiveTool('merge' as any)); dispatch(setActiveTool2D('merge')); }],
      ['tool.topstitchEdit', () => { dispatch(setActiveTool('topstitchEdit' as any)); dispatch(setActiveTool2D('topstitchEdit')); }],
      ['tool.topstitchSegment', () => { dispatch(setActiveTool('topstitchSegment' as any)); dispatch(setActiveTool2D('topstitchSegment')); }],
      ['tool.topstitchFree', () => { dispatch(setActiveTool('topstitchFree' as any)); dispatch(setActiveTool2D('topstitchFree')); }],
      ['tool.topstitchSeamline', () => { dispatch(setActiveTool('topstitchSeamline' as any)); dispatch(setActiveTool2D('topstitchSeamline')); }],

      ['tool.pomMeasure', () => { dispatch(setActiveTool('pomMeasure' as any)); dispatch(setActiveTool2D('pomMeasure')); }],
      ['tool.offsetOutline', () => { dispatch(setActiveTool('offsetOutline' as any)); dispatch(setActiveTool2D('offsetOutline')); }],
      ['tool.extendTrim', () => { dispatch(setActiveTool('extendTrim' as any)); dispatch(setActiveTool2D('extendTrim')); }],
      ['tool.polyPen', () => { dispatch(setActiveTool('polyPen' as any)); dispatch(setActiveTool2D('polyPen')); }],

      // Sewing
      ['tool.seam', () => { dispatch(setActiveTool('seam' as any)); dispatch(setActiveTool2D('seam')); }],
      ['tool.freeSewing', () => { dispatch(setActiveTool('freesewing' as any)); dispatch(setActiveTool2D('freesewing')); }],
      ['tool.segmentSewing', () => { dispatch(setActiveTool('segmentSewing' as any)); dispatch(setActiveTool2D('segmentSewing')); }],

      // Shift+Key tools
      ['tool.grainline', () => { dispatch(setActiveTool('grainline' as any)); dispatch(setActiveTool2D('grainline')); }],
      ['tool.freeSewingAlt', () => { dispatch(setActiveTool('freesewing' as any)); dispatch(setActiveTool2D('freesewing')); }],
      ['tool.notch', () => { dispatch(setActiveTool('notch' as any)); dispatch(setActiveTool2D('notch')); }],
      ['tool.line', () => { dispatch(setActiveTool('line' as any)); dispatch(setActiveTool2D('line')); }],

      // 3D Tools
      ['tool3d.steamBrush', () => dispatch(setActiveTool3D('steamBrush'))],
      ['tool3d.meshGrab', () => dispatch(setActiveTool3D('meshGrab'))],

      // Fit Maps
      ['fitmap.stress', () => dispatch(setFitMapMode(fitMapMode === 'stress' ? 'none' : 'stress'))],
      ['fitmap.strain', () => dispatch(setFitMapMode(fitMapMode === 'strain' ? 'none' : 'strain'))],
      ['fitmap.fit', () => dispatch(setFitMapMode(fitMapMode === 'fit' ? 'none' : 'fit'))],
      ['fitmap.pressure', () => dispatch(setFitMapMode(fitMapMode === 'pressure' ? 'none' : 'pressure'))],
      ['fitmap.none', () => dispatch(setFitMapMode('none'))],
    ];

    // ─── Register all handlers ──────────────────────────────────────────

    for (const [id, handler] of handlers) {
      registry.registerHandler(id, handler);
    }

    return () => {
      for (const [id] of handlers) {
        registry.unregisterHandler(id);
      }
    };
  }, [registry, dispatch, pieces, selectedPieceIds, selectedSeamId, viewMode3D, fitMapMode, avatar, projectState, clipboard, xrayMode, layerLocked]);
}
