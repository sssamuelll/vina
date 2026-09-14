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
  clearSelection,
  selectAllVisiblePieces,
  toggleSeamAllowance,
  requestFitView,
  undo,
  redo,
  copyPieces,
  createPastedPieces,
} from '../store/editorSlice';
import { setActiveTool3D } from '../store/toolSlice';
import { activate2DTool } from '../store/toolActivation';
import { resolverBorrado } from '../store/borradoDeSeleccion';
import { parteElTrazo } from '../components/PatternEditor/trazos/trazoPath';
import { pushJournal } from '../utils/telemetry/journal';
import { removePieces, removeSeam, removeInternalLine, removePOM, removeTramoDeTrazo, reverseSeam, addPiece, duplicatePiece, flipPieceH } from '../store/projectSlice';
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
import { saveToStorage } from '../utils/projectIO';
import { showSuccessToast, showInfoToast } from '../store/copilotUISlice';
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
  const selectedPOMId = useSelector((s: RootState) => s.editor.selectedPOMId);
  const selectedInternalLine = useSelector((s: RootState) => s.editor.selectedInternalLine);
  const selectedTrazo = useSelector((s: RootState) => s.editor.selectedTrazo);
  const activeTool = useSelector((s: RootState) => s.editor.activeTool);
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

    // El sujeto lo decide `resolverBorrado` (#1115) — la misma función que usa
    // el menú Edición ▸ Eliminar. Aquí solo se despacha lo que ella dijo.
    const deleteSelection = () => {
      const sujeto = resolverBorrado({
        activeTool,
        selectedPieceIds,
        selectedSeamId,
        selectedPOMId,
        selectedInternalLine,
        selectedTrazo,
        piezasBloqueadas: new Set(pieces.filter(p => p.locked === true).map(p => p.id)),
      });
      switch (sujeto.kind) {
        case 'seam':
          dispatch(removeSeam(sujeto.id));
          break;
        case 'internalLine':
          dispatch(removeInternalLine({ pieceId: sujeto.pieceId, lineId: sujeto.lineId }));
          dispatch(clearSelection());
          break;
        case 'trazo': {
          // Toda superficie nueva nace instrumentada (spec 2026-09-12 § 5.6).
          // `parte` es lo que ella ve: si este Supr rompe el trazo en dos.
          const trazo = projectState.trazos.find(t => t.id === sujeto.trazoId);
          pushJournal('gesture', 'trazo:delete', {
            trazoId: sujeto.trazoId,
            segmentIndex: sujeto.segmentIndex,
            parte: trazo ? parteElTrazo(trazo.path, sujeto.segmentIndex) : false,
          });
          dispatch(removeTramoDeTrazo({ trazoId: sujeto.trazoId, segmentIndex: sujeto.segmentIndex }));
          dispatch(clearSelection());
          break;
        }
        case 'pom':
          dispatch(removePOM(sujeto.id));
          break;
        case 'pieces':
          dispatch(removePieces(sujeto.ids));
          break;
        case 'nada':
          if (sujeto.motivo === 'bloqueada') {
            dispatch(showInfoToast('Pieza bloqueada: se puede mover, pero no editar. Desbloquéala con clic derecho.'));
          }
          break;
      }
    };

    // ─── Define all handlers ────────────────────────────────────────────

    const handlers: Array<[string, () => void]> = [
      // File — manual save through the modern async path (autosave also runs;
      // explicit Ctrl+S deserves explicit feedback).
      ['file.save', wrapHandler(() => {
        void saveToStorage(projectState)
          .then(() => dispatch(showSuccessToast('Proyecto guardado')))
          .catch(() => {});
      })],

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
      ['edit.delete', wrapHandler(deleteSelection)],
      ['edit.deleteAlt', wrapHandler(deleteSelection)],

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
      ['view.fitPattern', () => dispatch(requestFitView())],
      ['view.layersPanel', () => window.dispatchEvent(new CustomEvent('vina:toggleLayersPanel'))],
      ['view.xrayMode', () => dispatch(setXrayMode({ enabled: !xrayMode }))],

      // 2D Tools (CLO3D mapping) — all route through the single writer
      ['tool.transform', () => activate2DTool(dispatch, 'transform')],
      ['tool.select', () => activate2DTool(dispatch, 'select')],
      ['tool.editPattern', () => activate2DTool(dispatch, 'editPattern')],
      ['tool.editCurve', () => activate2DTool(dispatch, 'editCurve')],
      ['tool.editConstrain', () => activate2DTool(dispatch, 'editConstrain')],
      ['tool.pen', () => activate2DTool(dispatch, 'pen')],
      ['tool.rectangle', () => activate2DTool(dispatch, 'rectangle')],
      ['tool.circle', () => activate2DTool(dispatch, 'circle')],
      ['tool.internalShape', () => activate2DTool(dispatch, 'internalShape')],
      ['tool.trace', () => activate2DTool(dispatch, 'trace')],
      ['tool.dart', () => activate2DTool(dispatch, 'dart')],
      ['tool.scissors', () => activate2DTool(dispatch, 'scissors')],
      ['tool.pin', () => activate2DTool(dispatch, 'pin')],
      ['tool.measure', () => activate2DTool(dispatch, 'measure')],
      ['tool.walkSeam', () => activate2DTool(dispatch, 'walkSeam')],
      ['tool.merge', () => activate2DTool(dispatch, 'merge')],
      ['tool.topstitchEdit', () => activate2DTool(dispatch, 'topstitchEdit')],
      ['tool.topstitchSegment', () => activate2DTool(dispatch, 'topstitchSegment')],
      ['tool.topstitchFree', () => activate2DTool(dispatch, 'topstitchFree')],
      ['tool.topstitchSeamline', () => activate2DTool(dispatch, 'topstitchSeamline')],

      ['tool.pomMeasure', () => activate2DTool(dispatch, 'pomMeasure')],
      ['tool.offsetOutline', () => activate2DTool(dispatch, 'offsetOutline')],
      ['tool.extendTrim', () => activate2DTool(dispatch, 'extendTrim')],
      ['tool.seamAllowance', () => activate2DTool(dispatch, 'seamAllowance')],

      // Sewing
      ['tool.seamEdit', () => activate2DTool(dispatch, 'seamEdit')],
      ['tool.seam', () => activate2DTool(dispatch, 'seam')],

      // Shift+Key tools
      ['tool.grainline', () => activate2DTool(dispatch, 'grainline')],
      ['tool.notch', () => activate2DTool(dispatch, 'notch')],

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
  }, [registry, dispatch, pieces, selectedPieceIds, selectedSeamId, selectedPOMId, selectedInternalLine, selectedTrazo, activeTool, viewMode3D, fitMapMode, avatar, projectState, clipboard, xrayMode, layerLocked]);
}
