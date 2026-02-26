/**
 * useKeyboardShortcuts — CLO3D-compatible global keyboard shortcut system.
 *
 * Implements the full CLO3D shortcut map from Core 8 manual.
 * Context-aware: same key can do different things in 2D vs 3D.
 *
 * @see GitHub issue #124
 */

import { useEffect, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../store';
import {
  setActiveTool,
  clearSelection,
  selectAllPieces,
  toggleSeamAllowance,
  toggleGrainlines,
  undo,
  redo,
} from '../store/editorSlice';
import { setActiveTool2D, setActiveTool3D } from '../store/toolSlice';
import { removePiece, reverseSeam } from '../store/projectSlice';
import {
  startSimulation,
  resetSimulation,
  setViewMode3D,
  setQualityLevel,
  setParticleDistance,
  saveArrangementSnapshot,
  clearArrangementSnapshot,
} from '../store/simulationSlice';
import { placeGarmentPieces } from '../utils/cloth/garmentPlacement';
import { saveToLocalStorage } from '../utils/projectIO';
import { toolRegistry } from '../tools';

export interface ShortcutEntry {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  label: string;
  category: 'Simulation' | '3D Tools' | '2D Tools' | 'Sewing' | 'Selection' | 'Edit' | 'File' | 'View';
  action: () => void;
}

/** Exportable shortcut map for help overlay */
let _shortcutMap: ShortcutEntry[] = [];
export function getShortcutMap(): ShortcutEntry[] { return _shortcutMap; }

export function useKeyboardShortcuts() {
  const dispatch = useDispatch();
  const pieces = useSelector((s: RootState) => s.project.pieces);
  const selectedPieceIds = useSelector((s: RootState) => s.editor.selectedPieceIds);
  const selectedSeamId = useSelector((s: RootState) => s.editor.selectedSeamId);
  const simulationState = useSelector((s: RootState) => s.simulation.simulationState);
  const viewMode3D = useSelector((s: RootState) => s.simulation.viewMode3D);
  const avatar = useSelector((s: RootState) => s.project.avatar);
  const projectState = useSelector((s: RootState) => s.project);
  const viewMode = useSelector((s: RootState) => s.editor.viewMode);

  // Tool registry shortcuts
  const toolShortcuts = useMemo(() => toolRegistry.getShortcuts(), []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't trigger when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const ctrl = e.metaKey || e.ctrlKey;
      const shift = e.shiftKey;
      const key = e.key.toLowerCase();

      // ─── File shortcuts ───────────────────────────────────────────────

      // Ctrl+S — Save project
      if (ctrl && key === 's' && !shift) {
        e.preventDefault();
        saveToLocalStorage(projectState);
        return;
      }

      // Ctrl+Z — Undo
      if (ctrl && key === 'z' && !shift) {
        e.preventDefault();
        dispatch(undo());
        return;
      }

      // Ctrl+Shift+Z / Ctrl+Y — Redo
      if (ctrl && ((key === 'z' && shift) || key === 'y')) {
        e.preventDefault();
        dispatch(redo());
        return;
      }

      // ─── Selection shortcuts ──────────────────────────────────────────

      // Ctrl+A — Select All pieces
      if (ctrl && key === 'a' && !shift) {
        e.preventDefault();
        dispatch(selectAllPieces(pieces.map(p => p.id)));
        return;
      }

      // Ctrl+B — Reverse sewing direction
      if (ctrl && key === 'b' && !shift && selectedSeamId) {
        e.preventDefault();
        dispatch(reverseSeam(selectedSeamId));
        return;
      }

      // Escape — Clear selection / hide gizmo
      if (key === 'escape') {
        dispatch(clearSelection());
        return;
      }

      // Delete / Backspace — Delete selected pieces
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedPieceIds.length > 0) {
        selectedPieceIds.forEach(id => dispatch(removePiece(id)));
        dispatch(clearSelection());
        return;
      }

      // ─── Simulation shortcuts ─────────────────────────────────────────

      // Shift+Space — Simulate Hi-Res (production quality)
      if (key === ' ' && shift) {
        e.preventDefault();
        if (viewMode3D === 'arrange') {
          dispatch(setQualityLevel('production'));
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
        return;
      }

      // Space — Toggle Arrange ↔ Simulate mode
      if (key === ' ') {
        e.preventDefault();
        if (viewMode3D === 'arrange') {
          // Save arrangement snapshot, switch to simulate
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
          // Back to arrange
          dispatch(resetSimulation());
          dispatch(setViewMode3D('arrange'));
        }
        return;
      }

      // Ctrl+F — Reset 3D Arrangement
      if (ctrl && key === 'f' && !shift) {
        e.preventDefault();
        dispatch(resetSimulation());
        dispatch(setViewMode3D('arrange'));
        dispatch(clearArrangementSnapshot());
        return;
      }

      // ─── View shortcuts ───────────────────────────────────────────────

      // Shift+S — Toggle seam allowance visibility
      if (shift && key === 's' && !ctrl) {
        dispatch(toggleSeamAllowance());
        return;
      }

      // Shift+G — Toggle grainlines
      if (shift && key === 'g' && !ctrl) {
        dispatch(toggleGrainlines());
        return;
      }

      // ─── Tool shortcuts (no modifiers) ────────────────────────────────
      if (ctrl || shift || e.altKey) return;

      // Q — Select/Move (3D camera tool)
      if (key === 'q') {
        dispatch(setActiveTool3D('camera'));
        return;
      }

      // A — Transform Pattern (2D select tool)
      if (key === 'a') {
        dispatch(setActiveTool('select' as any));
        dispatch(setActiveTool2D('select'));
        return;
      }

      // B — Edit Sewing
      if (key === 'b') {
        dispatch(setActiveTool('sew' as any));
        dispatch(setActiveTool2D('sew'));
        return;
      }

      // M — Segment Sewing / Free Sewing
      if (key === 'm') {
        dispatch(setActiveTool('sew' as any));
        dispatch(setActiveTool2D('sew'));
        return;
      }

      // Check tool shortcuts from registry (fallback)
      const toolId = toolShortcuts[key];
      if (toolId) {
        const tool = toolRegistry.getTool(toolId);
        if (tool) {
          if (tool.context === '2d' || tool.context === 'both') {
            dispatch(setActiveTool(toolId as any));
            dispatch(setActiveTool2D(toolId));
          }
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [dispatch, pieces, selectedPieceIds, selectedSeamId, simulationState, viewMode3D, avatar, projectState, viewMode, toolShortcuts]);

  // Build exportable shortcut map (for help overlay)
  useEffect(() => {
    _shortcutMap = [
      { key: 'Space', label: 'Toggle Simulation', category: 'Simulation', action: () => {} },
      { key: 'Space', shift: true, label: 'Simulate Hi-Res', category: 'Simulation', action: () => {} },
      { key: 'Q', label: 'Select/Move (3D)', category: '3D Tools', action: () => {} },
      { key: 'Escape', label: 'Deselect / Hide Gizmo', category: 'Selection', action: () => {} },
      { key: 'A', label: 'Transform Pattern (2D)', category: '2D Tools', action: () => {} },
      { key: 'B', label: 'Edit Sewing', category: 'Sewing', action: () => {} },
      { key: 'M', label: 'Segment Sewing', category: 'Sewing', action: () => {} },
      { key: 'B', ctrl: true, label: 'Reverse Sewing', category: 'Sewing', action: () => {} },
      { key: 'A', ctrl: true, label: 'Select All', category: 'Selection', action: () => {} },
      { key: 'S', ctrl: true, label: 'Save', category: 'File', action: () => {} },
      { key: 'Z', ctrl: true, label: 'Undo', category: 'Edit', action: () => {} },
      { key: 'Z', ctrl: true, shift: true, label: 'Redo', category: 'Edit', action: () => {} },
      { key: 'Y', ctrl: true, label: 'Redo', category: 'Edit', action: () => {} },
      { key: 'S', shift: true, label: 'Toggle Seam Allowance', category: 'View', action: () => {} },
      { key: 'G', shift: true, label: 'Toggle Grainlines', category: 'View', action: () => {} },
      { key: 'A', shift: true, label: 'Toggle Avatar', category: 'View', action: () => {} },
      { key: 'F10', label: 'Snapshot 3D', category: 'View', action: () => {} },
      { key: 'F', ctrl: true, label: 'Reset 3D Arrangement', category: 'View', action: () => {} },
      { key: 'Delete', label: 'Delete Selected', category: 'Edit', action: () => {} },
    ];
  }, []);
}
