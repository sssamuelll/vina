/* eslint-disable @typescript-eslint/no-explicit-any */
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

      // Shift+G — Grainline tool (displaced from G)
      if (shift && key === 'g' && !ctrl) {
        dispatch(setActiveTool('grainline' as any));
        dispatch(setActiveTool2D('grainline'));
        return;
      }

      // Shift+F — Free Sewing (alternative)
      if (shift && key === 'f' && !ctrl) {
        dispatch(setActiveTool('freeSewing' as any));
        dispatch(setActiveTool2D('freeSewing'));
        return;
      }

      // Shift+N — Notch tool (displaced from N)
      if (shift && key === 'n' && !ctrl) {
        dispatch(setActiveTool('notch' as any));
        dispatch(setActiveTool2D('notch'));
        return;
      }

      // Shift+L — Line tool (displaced from L)
      if (shift && key === 'l' && !ctrl) {
        dispatch(setActiveTool('line' as any));
        dispatch(setActiveTool2D('line'));
        return;
      }

      // ─── CLO3D 2D Tool shortcuts (no modifiers) ────────────────────────
      if (ctrl || shift || e.altKey) return;

      // Q — Select/Move (3D camera tool)
      if (key === 'q') {
        dispatch(setActiveTool3D('camera'));
        return;
      }

      // A — Transform Pattern
      if (key === 'a') {
        dispatch(setActiveTool('transform' as any));
        dispatch(setActiveTool2D('transform'));
        return;
      }

      // Z — Edit Pattern (Select)
      if (key === 'z') {
        dispatch(setActiveTool('select' as any));
        dispatch(setActiveTool2D('select'));
        return;
      }

      // V — Edit Curve Point
      if (key === 'v') {
        dispatch(setActiveTool('editCurve' as any));
        dispatch(setActiveTool2D('editCurve'));
        return;
      }

      // C — Edit Curvature
      if (key === 'c') {
        dispatch(setActiveTool('editConstrain' as any));
        dispatch(setActiveTool2D('editConstrain'));
        return;
      }

      // H — Polygon (Pen)
      if (key === 'h') {
        dispatch(setActiveTool('pen' as any));
        dispatch(setActiveTool2D('pen'));
        return;
      }

      // S — Rectangle
      if (key === 's') {
        dispatch(setActiveTool('rectangle' as any));
        dispatch(setActiveTool2D('rectangle'));
        return;
      }

      // E — Ellipse (Circle)
      if (key === 'e') {
        dispatch(setActiveTool('circle' as any));
        dispatch(setActiveTool2D('circle'));
        return;
      }

      // G — Internal Shape
      if (key === 'g') {
        dispatch(setActiveTool('internalShape' as any));
        dispatch(setActiveTool2D('internalShape'));
        return;
      }

      // I — Trace
      if (key === 'i') {
        dispatch(setActiveTool('trace' as any));
        dispatch(setActiveTool2D('trace'));
        return;
      }

      // B — Edit Sewing (Seam)
      if (key === 'b') {
        dispatch(setActiveTool('seam' as any));
        dispatch(setActiveTool2D('seam'));
        return;
      }

      // M — Measure
      if (key === 'm') {
        dispatch(setActiveTool('measure' as any));
        dispatch(setActiveTool2D('measure'));
        return;
      }

      // F — Free Sewing
      if (key === 'f') {
        dispatch(setActiveTool('freeSewing' as any));
        dispatch(setActiveTool2D('freeSewing'));
        return;
      }

      // J — Merge Patterns
      if (key === 'j') {
        dispatch(setActiveTool('merge' as any));
        dispatch(setActiveTool2D('merge'));
        return;
      }

      // D — Dart
      if (key === 'd') {
        dispatch(setActiveTool('dart' as any));
        dispatch(setActiveTool2D('dart'));
        return;
      }

      // X — Scissors
      if (key === 'x') {
        dispatch(setActiveTool('scissors' as any));
        dispatch(setActiveTool2D('scissors'));
        return;
      }

      // W — Pin
      if (key === 'w') {
        dispatch(setActiveTool('pin' as any));
        dispatch(setActiveTool2D('pin'));
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
      // Simulation
      { key: 'Space', label: 'Toggle Simulation', category: 'Simulation', action: () => {} },
      { key: 'Space', shift: true, label: 'Simulate Hi-Res', category: 'Simulation', action: () => {} },
      // 3D Tools
      { key: 'Q', label: 'Select/Move (3D)', category: '3D Tools', action: () => {} },
      // 2D Tools (CLO3D mapping)
      { key: 'A', label: 'Transform Pattern', category: '2D Tools', action: () => {} },
      { key: 'Z', label: 'Edit Pattern (Select)', category: '2D Tools', action: () => {} },
      { key: 'V', label: 'Edit Curve Point', category: '2D Tools', action: () => {} },
      { key: 'C', label: 'Edit Curvature', category: '2D Tools', action: () => {} },
      { key: 'H', label: 'Polygon (Pen)', category: '2D Tools', action: () => {} },
      { key: 'S', label: 'Rectangle', category: '2D Tools', action: () => {} },
      { key: 'E', label: 'Ellipse (Circle)', category: '2D Tools', action: () => {} },
      { key: 'G', label: 'Internal Shape', category: '2D Tools', action: () => {} },
      { key: 'I', label: 'Trace', category: '2D Tools', action: () => {} },
      { key: 'D', label: 'Dart', category: '2D Tools', action: () => {} },
      { key: 'X', label: 'Scissors', category: '2D Tools', action: () => {} },
      { key: 'W', label: 'Pin', category: '2D Tools', action: () => {} },
      // Sewing
      { key: 'B', label: 'Edit Sewing (Seam)', category: 'Sewing', action: () => {} },
      { key: 'F', label: 'Free Sewing', category: 'Sewing', action: () => {} },
      { key: 'B', ctrl: true, label: 'Reverse Sewing', category: 'Sewing', action: () => {} },
      // Displaced tools (Shift+Key)
      { key: 'G', shift: true, label: 'Grainline Tool', category: '2D Tools', action: () => {} },
      { key: 'M', label: 'Measure', category: '2D Tools', action: () => {} },
      { key: 'J', label: 'Merge Patterns', category: '2D Tools', action: () => {} },
      { key: 'N', shift: true, label: 'Notch Tool', category: '2D Tools', action: () => {} },
      { key: 'L', shift: true, label: 'Line Tool', category: '2D Tools', action: () => {} },
      // Selection
      { key: 'Escape', label: 'Deselect / Hide Gizmo', category: 'Selection', action: () => {} },
      { key: 'A', ctrl: true, label: 'Select All', category: 'Selection', action: () => {} },
      // File
      { key: 'S', ctrl: true, label: 'Save', category: 'File', action: () => {} },
      // Edit
      { key: 'Z', ctrl: true, label: 'Undo', category: 'Edit', action: () => {} },
      { key: 'Z', ctrl: true, shift: true, label: 'Redo', category: 'Edit', action: () => {} },
      { key: 'Y', ctrl: true, label: 'Redo', category: 'Edit', action: () => {} },
      { key: 'Delete', label: 'Delete Selected', category: 'Edit', action: () => {} },
      // View
      { key: 'S', shift: true, label: 'Toggle Seam Allowance', category: 'View', action: () => {} },
      { key: 'A', shift: true, label: 'Toggle Avatar', category: 'View', action: () => {} },
      { key: 'F10', label: 'Snapshot 3D', category: 'View', action: () => {} },
      { key: 'F', ctrl: true, label: 'Reset 3D Arrangement', category: 'View', action: () => {} },
    ];
  }, []);
}
