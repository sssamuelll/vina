import { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../store';
import { setActiveTool, clearSelection, undo, redo } from '../store/editorSlice';
import { removePiece } from '../store/projectSlice';
import { Tool2D } from '../types/types';

const SHORTCUTS: Record<string, Tool2D> = {
  'v': 'select',
  'p': 'pen',
  'l': 'line',
  'r': 'rectangle',
  's': 'seam',
  'n': 'notch',
  'g': 'grainline',
  'm': 'measure',
  'h': 'hand',
};

export function useKeyboardShortcuts() {
  const dispatch = useDispatch();
  const selectedPieceIds = useSelector((s: RootState) => s.editor.selectedPieceIds);

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

      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const tool = SHORTCUTS[e.key.toLowerCase()];
      if (tool) {
        dispatch(setActiveTool(tool));
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [dispatch, selectedPieceIds]);
}
