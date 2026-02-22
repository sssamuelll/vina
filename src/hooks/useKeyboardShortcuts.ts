import { useEffect, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../store';
import { setActiveTool, clearSelection, toggleSeamAllowance, undo, redo } from '../store/editorSlice';
import { setActiveTool2D } from '../store/toolSlice';
import { removePiece } from '../store/projectSlice';
import { toolRegistry } from '../tools';

export function useKeyboardShortcuts() {
  const dispatch = useDispatch();
  const selectedPieceIds = useSelector((s: RootState) => s.editor.selectedPieceIds);

  // Generate shortcuts from tool registry
  const shortcuts = useMemo(() => {
    return toolRegistry.getShortcuts();
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't trigger when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      // Delete selected pieces
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedPieceIds.length > 0) {
        selectedPieceIds.forEach(id => dispatch(removePiece(id)));
        dispatch(clearSelection());
        return;
      }

      // Undo/Redo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        dispatch(undo());
        return;
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'z' && e.shiftKey || e.key === 'y')) {
        e.preventDefault();
        dispatch(redo());
        return;
      }

      // Shift+S toggles seam allowance visibility
      if (e.shiftKey && e.key === 'S') {
        dispatch(toggleSeamAllowance());
        return;
      }

      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;

      // Check tool shortcuts from registry
      const toolId = shortcuts[e.key.toLowerCase()];
      if (toolId) {
        const tool = toolRegistry.getTool(toolId);
        if (tool) {
          if (tool.context === '2d' || tool.context === 'both') {
            // Update both old and new state for backward compatibility
            dispatch(setActiveTool(toolId as any));
            dispatch(setActiveTool2D(toolId));
          }
          // Note: 3D tool shortcuts would need workspace context to update 3D tools
          // For now, only 2D shortcuts work from this global hook
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [dispatch, selectedPieceIds, shortcuts]);
}